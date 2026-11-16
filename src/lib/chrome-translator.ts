/**
 * Chrome's built-in, on-device Translator API (desktop Chrome 138+).
 * https://developer.chrome.com/docs/ai/translator-api
 *
 * Free, fast (runs on the user's own computer), no server involved. Limits:
 *  - Desktop Chrome only (not Firefox/Safari/mobile), HTTPS pages only.
 *  - Each language pair needs a one-time model download, which Chrome only
 *    starts right after a click (user activation).
 *  - Not every language is offered; `availability()` says which.
 *
 * Every call here has a timeout: some Chromium builds expose the API but never
 * answer, and the caller must fall back to LibreTranslate instead of hanging.
 */
import type { JobState } from "./client-utils";
import { unescapeSkeletonText } from "./segments";

interface ChromeTranslator {
  translate(text: string): Promise<string>;
  destroy?: () => void;
}
interface TranslatorStatic {
  availability(opts: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(opts: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (m: EventTarget) => void;
  }): Promise<ChromeTranslator>;
}

function api(): TranslatorStatic | null {
  if (typeof self === "undefined" || !("Translator" in self) || !self.isSecureContext) return null;
  return (self as unknown as { Translator: TranslatorStatic }).Translator;
}

export function chromeTranslatorSupported(): boolean {
  return api() !== null;
}

/** WebLingo language code -> Chrome (BCP 47) code. */
export function toChromeCode(code: string): string {
  const lower = code.toLowerCase();
  if (lower === "zh-tw") return "zh-Hant";
  if (lower === "pt-br") return "pt";
  if (lower === "nb") return "no";
  return lower;
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

export type ChromeStatus = "available" | "downloadable" | "downloading" | "unavailable";

export async function chromeAvailability(source: string, target: string, timeoutMs = 4000): Promise<ChromeStatus> {
  const T = api();
  if (!T) return "unavailable";
  const res = await withTimeout(
    T.availability({ sourceLanguage: toChromeCode(source), targetLanguage: toChromeCode(target) }),
    timeoutMs,
    "unavailable"
  );
  return (["available", "downloadable", "downloading"].includes(res) ? res : "unavailable") as ChromeStatus;
}

export interface PreparedTranslator {
  lang: string;
  availability: Promise<ChromeStatus>;
  translator: Promise<ChromeTranslator | null>;
}

/**
 * Starts creating translators for every language. MUST be called directly in
 * the click handler (before any await): Chrome only downloads a language model
 * during a user gesture. `onDownload` reports model download progress (0–1).
 */
export function prepareChromeTranslators(
  source: string,
  langs: string[],
  onDownload?: (lang: string, fraction: number) => void
): Map<string, PreparedTranslator> {
  const out = new Map<string, PreparedTranslator>();
  const T = api();
  for (const lang of langs) {
    if (!T) {
      out.set(lang, { lang, availability: Promise.resolve("unavailable"), translator: Promise.resolve(null) });
      continue;
    }
    const opts = {
      sourceLanguage: toChromeCode(source),
      targetLanguage: toChromeCode(lang),
      monitor: (m: EventTarget) =>
        m.addEventListener("downloadprogress", (e) => onDownload?.(lang, Number((e as unknown as { loaded: number }).loaded) || 0)),
    };
    let created: Promise<ChromeTranslator | null>;
    try {
      created = T.create(opts).catch(() => null);
    } catch {
      created = Promise.resolve(null);
    }
    out.set(lang, {
      lang,
      availability: chromeAvailability(source, lang),
      // A model download can take a while; give up after 2 minutes.
      translator: withTimeout(created, 120000, null),
    });
  }
  return out;
}

function placeholdersSame(source: string, translated: string): boolean {
  const tags = (s: string) => (s.match(/<\/?g\d+>/g) || []).sort().join(",");
  if (tags(source) !== tags(translated)) return false;
  return !/<(?!\/?g\d+>)[a-z/!]/i.test(translated);
}

async function postJSON<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  return data as T;
}

/**
 * Translates a job's pending strings in this browser with Chrome's on-device
 * model and saves them through the API. Returns when nothing more can be done
 * in the browser; strings it could not translate stay pending for
 * LibreTranslate (the caller runs the normal server steps afterwards).
 */
export async function translateJobInBrowser(
  jobId: number,
  translator: ChromeTranslator,
  opts: { autoApprove?: boolean; signal?: AbortSignal; onProgress?: (job: JobState, translatedHere: number) => void }
): Promise<{ translated: number; skipped: number; job: JobState | null }> {
  const exclude: number[] = [];
  let translated = 0;
  let consecutiveErrors = 0;
  let job: JobState | null = null;
  for (;;) {
    if (opts.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const claim = await postJSON<{ items: { stringId: number; sourceText: string }[]; job: JobState }>(
      `/api/jobs/${jobId}/claim`,
      { limit: 40, exclude, autoApprove: opts.autoApprove !== false },
      opts.signal
    );
    job = claim.job;
    opts.onProgress?.(job, translated);
    if (!claim.items.length) break;

    const results: { stringId: number; text: string }[] = [];
    for (const item of claim.items) {
      if (opts.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      const tagged = /<g\d+>/.test(item.sourceText);
      const input = tagged ? item.sourceText : unescapeSkeletonText(item.sourceText);
      const out = await withTimeout(translator.translate(input), 15000, "");
      const text = (out || "").trim();
      if (!text || (tagged && !placeholdersSame(item.sourceText, text))) {
        exclude.push(item.stringId); // leave it for LibreTranslate
        consecutiveErrors = text ? 0 : consecutiveErrors + 1;
        if (consecutiveErrors >= 5) return { translated, skipped: exclude.length, job }; // the model stopped answering
        continue;
      }
      consecutiveErrors = 0;
      results.push({ stringId: item.stringId, text });
    }
    if (results.length) {
      const saved = await postJSON<{ accepted: number; rejected: number[]; job: JobState }>(
        `/api/jobs/${jobId}/results`,
        { results, autoApprove: opts.autoApprove !== false },
        opts.signal
      );
      translated += saved.accepted;
      exclude.push(...saved.rejected);
      job = saved.job;
      opts.onProgress?.(job, translated);
    }
  }
  return { translated, skipped: exclude.length, job };
}
