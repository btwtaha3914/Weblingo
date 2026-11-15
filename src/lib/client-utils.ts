/**
 * Browser-safe helpers shared by dashboard components.
 * (No server-only imports here.)
 */
import { useSyncExternalStore } from "react";

/** Public origin visitors' browsers use to load widget.js. */
export function getPublicAppOrigin(): string {
  const configured = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  if (typeof window === "undefined") return configured || "https://YOUR-WEBLINGO-DOMAIN";
  const here = window.location.origin;
  const isLocal = /^https?:\/\/(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(here);
  // On a deployed dashboard the current origin is always correct. Locally,
  // NEXT_PUBLIC_APP_URL can point at a LAN/public address reachable by other devices.
  return isLocal && configured ? configured : here;
}

/**
 * React hook: the public origin, resolved after mount so server-rendered HTML
 * and the first client render match (no hydration mismatch).
 */
export function usePublicAppOrigin(): string {
  return useSyncExternalStore(subscribeNoop, getPublicAppOrigin, serverOrigin);
}
const subscribeNoop = () => () => {};
const serverOrigin = () =>
  (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "") || "https://YOUR-WEBLINGO-DOMAIN";

export function buildEmbedSnippet(opts: {
  apiKey: string;
  languages?: string[];
  defaultLanguage?: string;
  position?: string;
  accent?: string;
  origin?: string;
}): string {
  const origin = opts.origin || getPublicAppOrigin();
  const lines = [
    `<!-- WebLingo translation widget -->`,
    `<script`,
    `  src="${origin}/widget.js"`,
    `  data-project-key="${opts.apiKey}"`,
    `  data-default-language="${opts.defaultLanguage || "en"}"`,
  ];
  if (opts.languages && opts.languages.length) lines.push(`  data-languages="${opts.languages.join(",")}"`);
  if (opts.position && opts.position !== "bottom-right") lines.push(`  data-position="${opts.position}"`);
  if (opts.accent && opts.accent !== "#2563eb") lines.push(`  data-accent="${opts.accent}"`);
  lines.push(`  defer></script>`);
  return lines.join("\n");
}

export function buildConsoleCommand(apiKey: string, originOverride?: string): string {
  const origin = originOverride || getPublicAppOrigin();
  return `(function(){var s=document.createElement("script");s.src="${origin}/widget.js";s.setAttribute("data-project-key","${apiKey}");document.head.appendChild(s);})();`;
}

/** Human-readable version of a stored segment skeleton (placeholders removed). */
export function skeletonToDisplay(skeleton: string | null | undefined): string {
  if (!skeleton) return "";
  return skeleton
    .replace(/<\/?g\d+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export const RTL_CODES = new Set(["ar", "ur", "he", "fa", "ps", "sd", "ug", "yi"]);

export interface JobState {
  id: number;
  status: string;
  total: number;
  done: number;
  failed: number;
  remaining: number;
  lastError: string | null;
}

/**
 * Drives a translation job to completion: each POST runs one time-boxed step
 * on the server. Calls onProgress with the real counts after every step.
 */
export async function runJobToCompletion(
  jobId: number,
  opts: { autoApprove?: boolean; signal?: AbortSignal; onProgress?: (job: JobState) => void }
): Promise<JobState> {
  let stalled = 0;
  let lastRemaining = Number.POSITIVE_INFINITY;
  for (;;) {
    if (opts.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoApprove: opts.autoApprove !== false }),
      signal: opts.signal,
    });
    let data: { ok?: boolean; error?: string; job?: JobState } = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    if (!res.ok || !data.job) {
      // 502/504 from the host means a step overran the function limit: retry a few times.
      if ((res.status === 502 || res.status === 504) && stalled < 3) {
        stalled++;
        continue;
      }
      throw new Error(data.error || `Translation step failed (HTTP ${res.status}).`);
    }
    const job = data.job;
    opts.onProgress?.(job);
    if (job.status === "completed" || job.status === "completed_with_errors" || job.status === "failed") return job;
    if (job.remaining >= lastRemaining) {
      stalled++;
      if (stalled >= 4) {
        throw new Error(job.lastError ? `Translation is not progressing: ${job.lastError}` : "Translation is not progressing. Check the LibreTranslate server.");
      }
      await new Promise((r) => setTimeout(r, 1500 * stalled));
    } else {
      stalled = 0;
    }
    lastRemaining = job.remaining;
  }
}
