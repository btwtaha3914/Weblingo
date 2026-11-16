/**
 * WebLingo webpage fetcher & extractor.
 *
 * - SSRF protection: only http/https, DNS-resolved addresses are checked,
 *   loopback / link-local / metadata ranges always blocked, private ranges
 *   blocked unless allow-listed, and every redirect hop is re-validated.
 * - Size (EXTRACTION_MAX_SIZE_BYTES) and time (EXTRACTION_TIMEOUT_MS) limits.
 * - Parses HTML with a real, error-tolerant parser (node-html-parser) and
 *   splits the page into segments using the shared rules in segments.ts, so
 *   every extracted string can be matched by the browser widget.
 * - Extracts text runs (headings, paragraphs, nav, buttons, links, lists,
 *   tables, labels, captions, footer...), <title>, and visible text attributes
 *   (alt, title, placeholder, aria-label, button-like input values).
 * - Skips scripts, styles, comments, hidden elements and translate="no".
 * - Ordinary HTTP fetching cannot see text that is rendered by JavaScript in
 *   the browser; such pages are flagged with `likelyClientRendered`, and the
 *   widget reports text it sees but has no translation for (see
 *   /api/widget/missing) so it gets translated on the next run.
 */

import { parse, HTMLElement, Node as ParsedNode, NodeType } from "node-html-parser";
import { hashSourceText } from "./auth";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  ATOM_TAGS,
  INLINE_TAGS,
  SKIP_TAGS,
  TEXT_ATTRIBUTES,
  VALUE_INPUT_TYPES,
  escapeSkeletonText,
  isMeaningfulText,
  normalizeSkeleton,
  skeletonToPlainText,
} from "./segments";

export interface ExtractedStringItem {
  contentHash: string;
  /** Skeleton text (see segments.ts). Equal to the escaped plain text when there is no inline markup. */
  sourceText: string;
  wordCount: number;
  contextHint: string;
  domSelector: string;
  occurrenceIndex: number;
  occurrences: number;
}

export interface ExtractionResult {
  url: string;
  finalUrl: string;
  title: string;
  stringCount: number;
  totalOccurrences: number;
  strings: ExtractedStringItem[];
  links: string[];
  durationMs: number;
  likelyClientRendered: boolean;
}

const EXTRACTION_TIMEOUT_MS = Number(process.env.EXTRACTION_TIMEOUT_MS) || 6000;
const EXTRACTION_MAX_SIZE_BYTES = Number(process.env.EXTRACTION_MAX_SIZE_BYTES) || 5 * 1024 * 1024;

// ---------------------------------------------------------------------------
// SSRF validation
// ---------------------------------------------------------------------------

function isAlwaysBlockedAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");

  if (isIP(normalized) === 4) {
    const [first, second] = normalized.split(".").map(Number);
    // 0.0.0.0/8, loopback, link-local + cloud metadata (169.254.169.254), multicast/reserved
    return first === 0 || first === 127 || (first === 169 && second === 254) || first >= 224;
  }

  if (isIP(normalized) === 6) {
    // Only globally routable unicast IPv6 is eligible. This blocks loopback,
    // link-local, unique-local, multicast, unspecified and mapped addresses.
    return !/^[23]/i.test(normalized) || normalized.startsWith("2001:db8:") || normalized.startsWith("2002:");
  }

  return true;
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");

  if (isIP(normalized) === 4) {
    const [first, second] = normalized.split(".").map(Number);
    return first === 10 || (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) || (first === 100 && second >= 64 && second <= 127);
  }

  return isIP(normalized) === 6 && /^[fc]/i.test(normalized);
}

function privateHostIsAllowed(url: URL): boolean {
  const configuredHosts = (process.env.EXTRACTION_ALLOWED_PRIVATE_HOSTS || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  return configuredHosts.includes(url.host.toLowerCase());
}

/** Validates URL syntax, DNS results, and private-network policy before fetching. */
export async function validateSafeUrl(rawUrl: string): Promise<{ valid: boolean; error?: string; parsedUrl?: URL }> {
  try {
    if (typeof rawUrl !== "string" || rawUrl.length > 2048) {
      return { valid: false, error: "Please enter a valid website URL." };
    }
    const parsed = new URL(rawUrl.trim());

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { valid: false, error: "Only http:// and https:// URLs are permitted." };
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

    if (parsed.username || parsed.password) {
      return { valid: false, error: "URLs containing usernames or passwords are not permitted." };
    }

    // In development only, allow this app's own port so the bundled demo pages
    // (public/demo/*) can be extracted locally. Other loopback ports stay blocked.
    const isDev = process.env.NODE_ENV !== "production";
    const appPort = process.env.PORT || "3000";
    if (isDev && (hostname === "localhost" || hostname === "127.0.0.1")) {
      const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
      if (port === appPort) {
        return { valid: true, parsedUrl: parsed };
      }
    }

    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
      return { valid: false, error: `Access to internal host '${hostname}' is blocked for SSRF security.` };
    }

    let addresses: { address: string }[];
    try {
      addresses = isIP(hostname)
        ? [{ address: hostname }]
        : await lookup(hostname, { all: true, verbatim: true });
    } catch {
      return { valid: false, error: `Unable to resolve website host '${hostname}'. Check the address.` };
    }
    if (!addresses.length) return { valid: false, error: `Host '${hostname}' did not resolve to an IP address.` };

    const allowPrivateIps = process.env.ALLOW_PRIVATE_IPS === "true";
    const allowListedPrivateHost = privateHostIsAllowed(parsed);
    for (const { address } of addresses) {
      if (isAlwaysBlockedAddress(address)) {
        return { valid: false, error: `Access to internal host '${hostname}' is blocked for SSRF security.` };
      }
      if (isPrivateAddress(address) && !allowPrivateIps && !allowListedPrivateHost) {
        return {
          valid: false,
          error: `Private network host '${hostname}' is blocked. Add its exact host and port to EXTRACTION_ALLOWED_PRIVATE_HOSTS to allow it.`,
        };
      }
    }

    return { valid: true, parsedUrl: parsed };
  } catch {
    return { valid: false, error: "Invalid URL format. Example: https://example.com" };
  }
}

// ---------------------------------------------------------------------------
// Segmentation (mirror of public/widget.js — keep both in sync)
// ---------------------------------------------------------------------------

function tagOf(el: HTMLElement): string {
  return (el.rawTagName || "").toLowerCase();
}

function isExcluded(el: HTMLElement): boolean {
  const tag = tagOf(el);
  if (SKIP_TAGS.has(tag)) return true;
  if (el.hasAttribute("hidden") || el.hasAttribute("data-no-translate")) return true;
  if ((el.getAttribute("translate") || "").toLowerCase() === "no") return true;
  if (/(^|\s)notranslate(\s|$)/.test(el.getAttribute("class") || "")) return true;
  if (tag === "input" && (el.getAttribute("type") || "").toLowerCase() === "hidden") return true;
  const style = (el.getAttribute("style") || "").toLowerCase().replace(/\s+/g, "");
  if (style.includes("display:none") || style.includes("visibility:hidden")) return true;
  return false;
}

type ChildKind = "text" | "inline" | "atom" | "block" | "skip" | "ignore";

function classify(node: ParsedNode): ChildKind {
  if (node.nodeType === NodeType.TEXT_NODE) return "text";
  // Comments and other node types are invisible and never split a sentence.
  if (node.nodeType !== NodeType.ELEMENT_NODE) return "ignore";
  const el = node as HTMLElement;
  const tag = tagOf(el);
  if (INLINE_TAGS.has(tag) && isExcluded(el)) return "atom";
  if (ATOM_TAGS.has(tag)) return "atom";
  if (isExcluded(el)) return "skip";
  if (INLINE_TAGS.has(tag) && isInlineOnly(el)) return "inline";
  return "block";
}

function isInlineOnly(el: HTMLElement): boolean {
  for (const child of el.childNodes) {
    const kind = classify(child);
    if (kind === "block" || kind === "skip") return false;
  }
  return true;
}

function buildSkeleton(nodes: ParsedNode[], counter: { n: number }): string {
  let out = "";
  for (const node of nodes) {
    const kind = classify(node);
    if (kind === "text") {
      out += escapeSkeletonText(node.text);
    } else if (kind === "atom") {
      counter.n += 1;
      out += `<g${counter.n}></g${counter.n}>`;
    } else if (kind === "inline") {
      counter.n += 1;
      const k = counter.n;
      out += `<g${k}>` + buildSkeleton((node as HTMLElement).childNodes, counter) + `</g${k}>`;
    }
  }
  return out;
}

interface RawSegment {
  skeleton: string;
  context: string;
}

function significant(nodes: ParsedNode[]): ParsedNode[] {
  return nodes.filter((n) => !(n.nodeType === NodeType.TEXT_NODE && !n.text.trim()));
}

function flushRun(run: ParsedNode[], container: HTMLElement, out: RawSegment[]) {
  if (!run.length) return;
  const sig = significant(run);
  if (!sig.some((n) => n.nodeType === NodeType.TEXT_NODE)) {
    // No loose text, only inline elements (e.g. <li><a>Home</a></li> or a nav
    // of links): each element is its own unit, translated inside the element.
    for (const n of sig) if (classify(n) === "inline") processContainer(n as HTMLElement, out);
    return;
  }
  const skeleton = normalizeSkeleton(buildSkeleton(run, { n: 0 }));
  if (!skeleton) return;
  if (!isMeaningfulText(skeletonToPlainText(skeleton))) return;
  out.push({ skeleton, context: tagOf(container) || "text" });
}

function processContainer(container: HTMLElement, out: RawSegment[]) {
  let run: ParsedNode[] = [];
  for (const child of container.childNodes) {
    const kind = classify(child);
    if (kind === "text" || kind === "inline" || kind === "atom") {
      run.push(child);
    } else if (kind !== "ignore") {
      flushRun(run, container, out);
      run = [];
      if (kind === "block") processContainer(child as HTMLElement, out);
    }
  }
  flushRun(run, container, out);
}

function pushAttribute(out: RawSegment[], value: string, context: string) {
  const skeleton = normalizeSkeleton(escapeSkeletonText(value));
  if (skeleton) out.push({ skeleton, context });
}

function collectAttributes(root: HTMLElement, out: RawSegment[]) {
  const walk = (el: HTMLElement) => {
    for (const child of el.childNodes) {
      if (child.nodeType !== NodeType.ELEMENT_NODE) continue;
      const c = child as HTMLElement;
      const tag = tagOf(c);
      const excluded = isExcluded(c);
      // img/input are opaque inside sentences but their attributes are visible.
      if (!excluded || (!SKIP_TAGS.has(tag) && (tag === "img" || tag === "input") && !isNoTranslate(c))) {
        for (const attr of TEXT_ATTRIBUTES) {
          const v = c.getAttribute(attr);
          if (v) pushAttribute(out, v, `${tag}@${attr}`);
        }
        if (tag === "input" && VALUE_INPUT_TYPES.has((c.getAttribute("type") || "").toLowerCase())) {
          const v = c.getAttribute("value");
          if (v) pushAttribute(out, v, "input@value");
        }
      }
      if (!excluded) walk(c);
    }
  };
  walk(root);
}

function isNoTranslate(el: HTMLElement): boolean {
  return (
    el.hasAttribute("data-no-translate") ||
    (el.getAttribute("translate") || "").toLowerCase() === "no" ||
    /(^|\s)notranslate(\s|$)/.test(el.getAttribute("class") || "")
  );
}

/** Extracts translatable segments from raw HTML. Tolerates malformed HTML. */
export function extractTranslatableText(html: string, pageUrl: string, finalUrl = pageUrl): ExtractionResult {
  const started = performance.now();
  const root = parse(html, {
    comment: false,
    lowerCaseTagName: false,
    blockTextElements: { script: true, noscript: true, style: true, pre: true, textarea: true },
  });

  const titleEl = root.querySelector("title");
  const title = titleEl ? normalizeSkeleton(titleEl.text) : "";
  const body = (root.querySelector("body") || root) as HTMLElement;

  const raw: RawSegment[] = [];
  if (title && isMeaningfulText(title)) raw.push({ skeleton: escapeSkeletonText(title), context: "title" });
  processContainer(body, raw);
  collectAttributes(body, raw);

  const byHash = new Map<string, ExtractedStringItem>();
  let order = 0;
  for (const seg of raw) {
    if (!seg.skeleton || seg.skeleton.length > 5000) continue;
    const plain = skeletonToPlainText(seg.skeleton);
    if (!isMeaningfulText(plain)) continue;
    const contentHash = hashSourceText(seg.skeleton);
    const existing = byHash.get(contentHash);
    if (existing) {
      existing.occurrences += 1;
      continue;
    }
    byHash.set(contentHash, {
      contentHash,
      sourceText: seg.skeleton,
      wordCount: plain.split(/\s+/).filter(Boolean).length,
      contextHint: seg.context.slice(0, 100),
      domSelector: seg.context.slice(0, 100),
      occurrenceIndex: order++,
      occurrences: 1,
    });
  }

  // Same-origin links, for whole-site discovery.
  const links = new Set<string>();
  let base: URL | null = null;
  try {
    base = new URL(finalUrl);
  } catch {
    base = null;
  }
  if (base) {
    for (const a of root.querySelectorAll("a[href]")) {
      try {
        const u = new URL(a.getAttribute("href") || "", base);
        if (u.origin !== base.origin) continue;
        if (/\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|mp3|docx?|xlsx?|pptx?|css|js|xml|json)$/i.test(u.pathname)) continue;
        u.hash = "";
        u.search = "";
        links.add(u.toString());
      } catch {
        // ignore invalid hrefs
      }
    }
  }

  const strings = [...byHash.values()];
  const scriptCount = root.querySelectorAll("script").length;
  const likelyClientRendered =
    strings.length < 8 &&
    (scriptCount >= 3 || !!root.querySelector("#root, #app, #__next, [data-reactroot], app-root"));

  return {
    url: pageUrl,
    finalUrl,
    title: title || "Untitled page",
    stringCount: strings.length,
    totalOccurrences: strings.reduce((n, s) => n + s.occurrences, 0),
    strings,
    links: [...links],
    durationMs: Math.round(performance.now() - started),
    likelyClientRendered,
  };
}

// ---------------------------------------------------------------------------
// Safe fetching
// ---------------------------------------------------------------------------

/** Fetches HTML with SSRF checks on every redirect hop, a size cap and a timeout. */
export async function safeFetchHtml(rawUrl: string, timeoutMs = EXTRACTION_TIMEOUT_MS): Promise<{ html: string; finalUrl: string }> {
  const validation = await validateSafeUrl(rawUrl);
  if (!validation.valid || !validation.parsedUrl) {
    throw new Error(validation.error || "Invalid URL");
  }
  const deadline = Date.now() + timeoutMs;
  let currentUrl = validation.parsedUrl;
  let response: Response | undefined;

  for (let hop = 0; hop <= 5; hop++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("The website took too long to respond.");
    try {
      response = await fetch(currentUrl, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 WebLingoBot/1.0",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "Accept-Language": "en;q=0.9,*;q=0.5",
        },
        signal: AbortSignal.timeout(remaining),
        redirect: "manual",
        cache: "no-store",
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "TimeoutError" || name === "AbortError") throw new Error("The website took too long to respond.");
      const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : "";
      throw new Error(`Could not connect to the website${cause ? ` (${cause})` : ""}.`);
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location || hop === 5) throw new Error("The page redirected too many times or returned an invalid redirect.");
    const next = await validateSafeUrl(new URL(location, currentUrl).toString());
    if (!next.valid || !next.parsedUrl) throw new Error(next.error || "Redirect target is not allowed.");
    currentUrl = next.parsedUrl;
  }

  if (!response) throw new Error("No response received from the website.");
  if (response.status === 401 || response.status === 403 || response.status === 429 || response.status === 503) {
    await response.body?.cancel();
    throw new Error(`The website refused automated access (HTTP ${response.status}). It may block bots, rate-limit, or require login.`);
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`The website returned HTTP ${response.status} ${response.statusText}.`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) {
    await response.body?.cancel();
    throw new Error(`Unsupported content type '${contentType}'. Expected an HTML page.`);
  }
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > EXTRACTION_MAX_SIZE_BYTES) {
    await response.body?.cancel();
    throw new Error("The page is larger than the 5 MB safety limit.");
  }

  // Stream the body so oversized pages are cut off early.
  const reader = response.body?.getReader();
  if (!reader) return { html: "", finalUrl: currentUrl.toString() };
  const chunks: Buffer[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > EXTRACTION_MAX_SIZE_BYTES) {
      await reader.cancel();
      throw new Error("The page is larger than the 5 MB safety limit.");
    }
    chunks.push(Buffer.from(value));
  }
  const charset = /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().replace(/"/g, "") || "utf-8";
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(charset);
  } catch {
    decoder = new TextDecoder("utf-8");
  }
  return { html: decoder.decode(Buffer.concat(chunks)), finalUrl: currentUrl.toString() };
}

/** Safely fetches a webpage and extracts its translatable content. */
export async function fetchAndExtractPage(rawUrl: string, timeoutMs?: number): Promise<ExtractionResult> {
  const { html, finalUrl } = await safeFetchHtml(rawUrl, timeoutMs);
  return extractTranslatableText(html, rawUrl, finalUrl);
}
