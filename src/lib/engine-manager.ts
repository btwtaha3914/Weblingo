/**
 * WebLingo translation engine.
 *
 * Talks to a self-hosted LibreTranslate server (REST API, see
 * https://github.com/LibreTranslate/LibreTranslate) configured with:
 *   LIBRETRANSLATE_URL      e.g. http://117.102.7.15:8089   (required)
 *   LIBRETRANSLATE_API_KEY  only when the server has api keys enabled
 *
 * Verified LibreTranslate API behaviour this module relies on:
 *   GET  /languages            -> [{ code, name, targets: [...] }]
 *   POST /translate {q: string[] , source, target, format: "text"|"html"}
 *        -> { translatedText: string[] }   (array in, array out)
 *   source may be "auto"       -> adds detectedLanguage to the response
 *   format "html" keeps unknown tags such as <g1>..</g1>.
 *
 * Rules:
 *   - A failed translation is NEVER replaced by a fake or empty string. The
 *     caller receives { ok: false, error } and keeps the original text.
 *   - Failures are never written to translation memory.
 *   - LibreTranslate is CPU-bound (parallel requests do not raise throughput),
 *     so batches are sent sequentially and sized to fit a time budget.
 */

import { db } from "@/db";
import { userTranslationMemory, sharedTranslationMemory } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { hashSourceText } from "./auth";
import {
  escapeSkeletonText,
  placeholdersMatch,
  skeletonHasPlaceholders,
  unescapeSkeletonText,
} from "./segments";

const LT_URL = (process.env.LIBRETRANSLATE_URL || "").trim().replace(/\/+$/, "");
const LT_API_KEY = (process.env.LIBRETRANSLATE_API_KEY || "").trim();
const REQUEST_TIMEOUT_MS = Number(process.env.TRANSLATION_TIMEOUT_MS) || 15000;
const MAX_BATCH_ITEMS = Number(process.env.TRANSLATION_MAX_BATCH_SIZE) || 25;
const MAX_BATCH_CHARS = 2500;
const MAX_RETRIES = 3;

export const RTL_LANGUAGES = new Set(["ar", "ur", "he", "fa", "ps", "sd", "ug", "yi"]);

export function isRtlLanguage(code: string): boolean {
  return RTL_LANGUAGES.has(code.toLowerCase().split("-")[0]);
}

/** WebLingo/ISO code -> LibreTranslate code. */
const LT_CODE_ALIASES: Record<string, string> = {
  zh: "zh-Hans",
  "zh-cn": "zh-Hans",
  "zh-tw": "zh-Hant",
  "pt-br": "pt-BR",
  no: "nb",
};

export function toEngineCode(code: string): string {
  const lower = code.trim().toLowerCase();
  return LT_CODE_ALIASES[lower] || lower;
}

export class TranslationEngineError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
  }
}

export function isEngineConfigured(): boolean {
  return LT_URL.length > 0;
}

function requireEngineUrl(): string {
  if (!LT_URL) {
    throw new TranslationEngineError(
      "LIBRETRANSLATE_URL is not configured. Set it to your LibreTranslate server address.",
      false
    );
  }
  return LT_URL;
}

// ---------------------------------------------------------------------------
// Supported languages (cached)
// ---------------------------------------------------------------------------

interface EngineLanguage {
  code: string;
  name: string;
  targets: string[];
}

let languageCache: { at: number; languages: EngineLanguage[] } | null = null;
const LANGUAGE_CACHE_MS = 10 * 60 * 1000;

export async function getEngineLanguages(): Promise<EngineLanguage[]> {
  if (languageCache && Date.now() - languageCache.at < LANGUAGE_CACHE_MS) {
    return languageCache.languages;
  }
  const base = requireEngineUrl();
  const res = await fetch(`${base}/languages`, {
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new TranslationEngineError(`LibreTranslate /languages returned HTTP ${res.status}`, true);
  }
  const data = (await res.json()) as EngineLanguage[];
  if (!Array.isArray(data)) {
    throw new TranslationEngineError("LibreTranslate /languages returned an unexpected payload", true);
  }
  languageCache = { at: Date.now(), languages: data };
  return data;
}

/** Throws a non-retryable error when the pair is not installed on the server. */
export async function assertLanguagePair(source: string, target: string): Promise<void> {
  const languages = await getEngineLanguages();
  const tgt = toEngineCode(target);
  const src = source === "auto" ? null : toEngineCode(source);
  const known = new Set(languages.map((l) => l.code));
  if (!known.has(tgt)) {
    throw new TranslationEngineError(
      `Target language '${target}' is not installed on the LibreTranslate server. Installed: ${[...known].join(", ")}`,
      false
    );
  }
  if (src) {
    const entry = languages.find((l) => l.code === src);
    if (!entry) {
      throw new TranslationEngineError(`Source language '${source}' is not installed on the LibreTranslate server.`, false);
    }
    if (Array.isArray(entry.targets) && !entry.targets.includes(tgt)) {
      throw new TranslationEngineError(`LibreTranslate cannot translate ${source} -> ${target}.`, false);
    }
  }
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export async function checkEngineHealth(): Promise<{
  online: boolean;
  configured: boolean;
  status: string;
  engine: string;
  url: string | null;
  installed_languages: string[];
  latency_ms: number | null;
  error?: string;
}> {
  if (!LT_URL) {
    return {
      online: false,
      configured: false,
      status: "not_configured",
      engine: "LibreTranslate",
      url: null,
      installed_languages: [],
      latency_ms: null,
      error: "LIBRETRANSLATE_URL is not set",
    };
  }
  const started = Date.now();
  try {
    languageCache = null;
    const languages = await getEngineLanguages();
    return {
      online: true,
      configured: true,
      status: "healthy",
      engine: "LibreTranslate",
      url: LT_URL,
      installed_languages: languages.map((l) => l.code),
      latency_ms: Date.now() - started,
    };
  } catch (err) {
    return {
      online: false,
      configured: true,
      status: "unreachable",
      engine: "LibreTranslate",
      url: LT_URL,
      installed_languages: [],
      latency_ms: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Low-level LibreTranslate call with retries
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callLibreTranslate(
  q: string[],
  source: string,
  target: string,
  format: "text" | "html",
  deadline: number
): Promise<string[]> {
  const base = requireEngineUrl();
  const body: Record<string, unknown> = {
    q,
    source: source === "auto" ? "auto" : toEngineCode(source),
    target: toEngineCode(target),
    format,
  };
  if (LT_API_KEY) body.api_key = LT_API_KEY;

  let lastError: TranslationEngineError | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 500) break;
    try {
      const res = await fetch(`${base}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, remaining)),
        cache: "no-store",
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = new TranslationEngineError(`LibreTranslate returned HTTP ${res.status}`, true);
      } else if (!res.ok) {
        let detail = "";
        try {
          detail = ((await res.json()) as { error?: string }).error || "";
        } catch {
          // body was not JSON
        }
        throw new TranslationEngineError(`LibreTranslate returned HTTP ${res.status}${detail ? `: ${detail}` : ""}`, false);
      } else {
        const data = (await res.json()) as { translatedText?: unknown };
        const out = data.translatedText;
        if (!Array.isArray(out) || out.length !== q.length) {
          throw new TranslationEngineError("LibreTranslate returned a malformed batch response", true);
        }
        return out.map((v) => (typeof v === "string" ? v : ""));
      }
    } catch (err) {
      if (err instanceof TranslationEngineError && !err.retryable) throw err;
      const isTimeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      lastError =
        err instanceof TranslationEngineError
          ? err
          : new TranslationEngineError(
              isTimeout ? "LibreTranslate request timed out" : `LibreTranslate unreachable: ${err instanceof Error ? err.message : String(err)}`,
              true
            );
      // A timeout means the server is busy: retrying the same batch would just
      // time out again, so let the caller split or defer it.
      if (isTimeout) throw lastError;
    }
    const backoff = 400 * 2 ** attempt;
    if (Date.now() + backoff >= deadline - 500) break;
    await sleep(backoff);
  }
  throw lastError || new TranslationEngineError("LibreTranslate request failed", true);
}

// ---------------------------------------------------------------------------
// Segment translation (used by the website pipeline)
// ---------------------------------------------------------------------------

export type SegmentResult =
  | { ok: true; text: string }
  | { ok: false; deferred: true; error: string } // ran out of time / temporary: retry later
  | { ok: false; deferred: false; error: string }; // permanent failure for this text

function splitIntoBatches(items: { index: number; q: string }[]) {
  const batches: { index: number; q: string }[][] = [];
  let current: { index: number; q: string }[] = [];
  let chars = 0;
  for (const item of items) {
    if (current.length && (current.length >= MAX_BATCH_ITEMS || chars + item.q.length > MAX_BATCH_CHARS)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(item);
    chars += item.q.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

/**
 * Translates skeleton segments (see segments.ts). Plain segments go through
 * format "text"; segments with <gN> placeholders through format "html" and are
 * validated so no placeholder (link, bold text...) is lost.
 *
 * Stops starting new batches when the deadline is near and reports the
 * untouched segments as `deferred`, so a serverless step never overruns.
 */
export async function translateSegments(
  skeletons: string[],
  source: string,
  target: string,
  deadline: number
): Promise<SegmentResult[]> {
  const results: SegmentResult[] = skeletons.map(() => ({ ok: false, deferred: true, error: "not attempted" }));

  const plain: { index: number; q: string }[] = [];
  const tagged: { index: number; q: string }[] = [];
  skeletons.forEach((s, index) => {
    if (skeletonHasPlaceholders(s)) tagged.push({ index, q: s });
    else plain.push({ index, q: unescapeSkeletonText(s) });
  });

  const queue: { batch: { index: number; q: string }[]; format: "text" | "html" }[] = [
    ...splitIntoBatches(plain).map((batch) => ({ batch, format: "text" as const })),
    ...splitIntoBatches(tagged).map((batch) => ({ batch, format: "html" as const })),
  ];

  while (queue.length) {
    // Rough throughput of a CPU-bound LibreTranslate: ~0.5 s per segment.
    const job = queue[0];
    if (Date.now() + 1500 > deadline) break;
    queue.shift();
    try {
      const out = await callLibreTranslate(job.batch.map((b) => b.q), source, target, job.format, deadline);
      job.batch.forEach((item, i) => {
        const raw = (out[i] || "").trim();
        if (!raw) {
          results[item.index] = { ok: false, deferred: false, error: "LibreTranslate returned an empty translation" };
          return;
        }
        if (job.format === "html") {
          if (!placeholdersMatch(item.q, raw)) {
            results[item.index] = { ok: false, deferred: false, error: "Translation lost inline markup (links/formatting)" };
            return;
          }
          results[item.index] = { ok: true, text: raw };
        } else {
          results[item.index] = { ok: true, text: escapeSkeletonText(raw) };
        }
      });
    } catch (err) {
      const e = err instanceof TranslationEngineError ? err : new TranslationEngineError(String(err), true);
      if (!e.retryable) {
        job.batch.forEach((item) => {
          results[item.index] = { ok: false, deferred: false, error: e.message };
        });
        continue;
      }
      // Timed out or server busy: split the batch and try the halves if there is time.
      if (job.batch.length > 1 && Date.now() + 1500 < deadline) {
        const mid = Math.ceil(job.batch.length / 2);
        queue.unshift({ batch: job.batch.slice(mid), format: job.format });
        queue.unshift({ batch: job.batch.slice(0, mid), format: job.format });
        continue;
      }
      job.batch.forEach((item) => {
        results[item.index] = { ok: false, deferred: true, error: e.message };
      });
      break;
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Translation memory (only successful translations are ever stored)
// ---------------------------------------------------------------------------

/** Fake "[ES] text" / "[AR: text]" rows written by pre-rewrite versions; never reuse them. */
const LEGACY_FALLBACK_RE = /^\[[A-Z]{2,3}(-[A-Z]+)?(\]|:)/;

export async function lookupMemory(
  userId: number | undefined,
  sourceTexts: string[],
  source: string,
  target: string
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (!sourceTexts.length) return found;
  const byHash = new Map(sourceTexts.map((t) => [hashSourceText(t), t]));
  const hashes = [...byHash.keys()];
  for (let i = 0; i < hashes.length; i += 500) {
    const slice = hashes.slice(i, i + 500);
    const shared = await db
      .select({ hash: sharedTranslationMemory.sourceHash, text: sharedTranslationMemory.translatedText })
      .from(sharedTranslationMemory)
      .where(
        and(
          inArray(sharedTranslationMemory.sourceHash, slice),
          eq(sharedTranslationMemory.sourceLang, source),
          eq(sharedTranslationMemory.targetLang, target)
        )
      );
    for (const row of shared) if (!LEGACY_FALLBACK_RE.test(row.text)) found.set(byHash.get(row.hash)!, row.text);
    if (userId) {
      const own = await db
        .select({ hash: userTranslationMemory.sourceHash, text: userTranslationMemory.translatedText })
        .from(userTranslationMemory)
        .where(
          and(
            eq(userTranslationMemory.userId, userId),
            inArray(userTranslationMemory.sourceHash, slice),
            eq(userTranslationMemory.sourceLang, source),
            eq(userTranslationMemory.targetLang, target)
          )
        );
      // Personal memory wins over shared memory.
      for (const row of own) if (!LEGACY_FALLBACK_RE.test(row.text)) found.set(byHash.get(row.hash)!, row.text);
    }
  }
  return found;
}

export async function saveMemory(
  userId: number | undefined,
  entries: { sourceText: string; translatedText: string }[],
  source: string,
  target: string
): Promise<void> {
  if (!entries.length) return;
  const rows = entries.map((e) => ({
    sourceHash: hashSourceText(e.sourceText),
    sourceLang: source,
    targetLang: target,
    sourceText: e.sourceText,
    translatedText: e.translatedText,
  }));
  await db
    .insert(sharedTranslationMemory)
    .values(rows)
    .onConflictDoNothing();
  if (userId) {
    await db
      .insert(userTranslationMemory)
      .values(rows.map((r) => ({ ...r, userId })))
      .onConflictDoNothing();
  }
}

// ---------------------------------------------------------------------------
// Free-text translation (playground / test endpoint / seed)
// ---------------------------------------------------------------------------

export interface TranslationResultItem {
  original: string;
  translated: string;
  cached: boolean;
  ok: boolean;
  error?: string;
}

export interface TranslationResponsePayload {
  source_lang: string;
  target_lang: string;
  target_rtl: boolean;
  count: number;
  failed_count: number;
  translations: TranslationResultItem[];
  duration_ms: number;
  provider: string;
  model_version: string;
  detected_language?: string;
}

const MAX_CHUNK_LENGTH = 400;

/** Splits long text at paragraph and sentence boundaries, keeping separators. */
function splitLongText(text: string): string[] {
  if (text.length <= MAX_CHUNK_LENGTH) return [text];
  const parts = text.split(/(\n+)/);
  const out: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (/^\n+$/.test(part) || part.length <= MAX_CHUNK_LENGTH) {
      out.push(part);
      continue;
    }
    const sentences = part.match(/[^.!?؟۔;]+[.!?؟۔;]*\s*/g) || [part];
    let current = "";
    for (const s of sentences) {
      if (current && (current + s).length > MAX_CHUNK_LENGTH) {
        out.push(current);
        current = "";
      }
      current += s;
    }
    if (current) out.push(current);
  }
  return out;
}

/**
 * Translates arbitrary plain texts. Failed items keep their original text and
 * are flagged with ok=false (never silently replaced).
 */
export async function translateBatch(params: {
  source_lang: string;
  target_lang: string;
  texts: string[];
  userId?: number;
  saveToShared?: boolean;
  timeoutMs?: number;
}): Promise<TranslationResponsePayload> {
  const { source_lang = "en", target_lang = "es", texts = [], userId } = params;
  const started = Date.now();
  const deadline = started + (params.timeoutMs ?? 25000);
  const src = source_lang.toLowerCase().trim();
  const tgt = target_lang.toLowerCase().trim();

  const results: TranslationResultItem[] = texts.map((t) => ({ original: t, translated: t, cached: false, ok: false, error: "not attempted" }));

  if (src === tgt) {
    results.forEach((r) => Object.assign(r, { ok: true, cached: true, error: undefined }));
  } else {
    await assertLanguagePair(src, tgt);
    const memSources = texts.map((t) => t.trim()).filter(Boolean);
    const memory = src === "auto" ? new Map<string, string>() : await lookupMemory(userId, memSources, src, tgt);

    // Collect unique chunks that still need the engine.
    const chunkPlan = texts.map((t) => {
      const trimmed = t.trim();
      if (!trimmed) return { chunks: [] as string[], memory: "" };
      const mem = memory.get(trimmed);
      if (mem) return { chunks: [] as string[], memory: mem };
      return { chunks: splitLongText(trimmed), memory: "" };
    });
    const unique = [...new Set(chunkPlan.flatMap((p) => p.chunks.filter((c) => c.trim() && !/^\n+$/.test(c))))];
    const batches = splitIntoBatches(unique.map((q, index) => ({ index, q })));
    const translatedChunks = new Map<string, string>();
    let firstError: string | undefined;
    for (const batch of batches) {
      try {
        const out = await callLibreTranslate(batch.map((b) => b.q.trim()), src, tgt, "text", deadline);
        batch.forEach((b, i) => {
          const value = (out[i] || "").trim();
          if (value) translatedChunks.set(b.q, value);
        });
      } catch (err) {
        firstError = err instanceof Error ? err.message : String(err);
        if (err instanceof TranslationEngineError && !err.retryable) break;
      }
    }

    const toRemember: { sourceText: string; translatedText: string }[] = [];
    chunkPlan.forEach((plan, i) => {
      const r = results[i];
      if (!texts[i].trim()) {
        Object.assign(r, { translated: texts[i], ok: true, error: undefined });
      } else if (plan.memory) {
        Object.assign(r, { translated: plan.memory, cached: true, ok: true, error: undefined });
      } else {
        const missing = plan.chunks.filter((c) => c.trim() && !/^\n+$/.test(c) && !translatedChunks.has(c));
        if (missing.length) {
          Object.assign(r, { translated: texts[i], ok: false, error: firstError || "Translation failed" });
        } else {
          const joined = plan.chunks
            .map((c) => (/^\n+$/.test(c) ? c : translatedChunks.get(c) ?? c))
            .join(" ")
            .replace(/ ?(\n+) ?/g, "$1")
            .trim();
          Object.assign(r, { translated: joined, ok: true, error: undefined });
          if (src !== "auto") toRemember.push({ sourceText: texts[i].trim(), translatedText: joined });
        }
      }
    });
    if (params.saveToShared !== false) {
      try {
        await saveMemory(userId, toRemember, src, tgt);
      } catch (err) {
        console.error("[engine] failed to save translation memory:", err);
      }
    }
  }

  return {
    source_lang: src,
    target_lang: tgt,
    target_rtl: isRtlLanguage(tgt),
    count: results.length,
    failed_count: results.filter((r) => !r.ok).length,
    translations: results,
    duration_ms: Date.now() - started,
    provider: "libretranslate",
    model_version: "libretranslate",
  };
}
