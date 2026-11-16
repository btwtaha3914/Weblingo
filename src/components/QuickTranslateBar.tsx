"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};
import { LanguageMultiSelect } from "@/components/LanguageMultiSelect";
import {
  JobState,
  RTL_CODES,
  buildConsoleCommand,
  buildEmbedSnippet,
  runJobToCompletion,
  skeletonToDisplay,
  usePublicAppOrigin,
} from "@/lib/client-utils";
import {
  PreparedTranslator,
  chromeTranslatorSupported,
  prepareChromeTranslators,
  translateJobInBrowser,
} from "@/lib/chrome-translator";

interface Language {
  code: string;
  name: string;
  nativeName: string;
  rtl: boolean;
}

interface ResultRow {
  stringId: number;
  sourceText: string;
  translatedText: string | null;
  status: string | null;
  contextHint: string | null;
}

type StageKey = "connect" | "extract" | "pages" | "translate" | "save" | "script";
type StageStatus = "pending" | "active" | "done" | "error";

const FALLBACK_LANGUAGES: Language[] = [
  { code: "es", name: "Spanish", nativeName: "Español", rtl: false },
  { code: "fr", name: "French", nativeName: "Français", rtl: false },
  { code: "de", name: "German", nativeName: "Deutsch", rtl: false },
  { code: "ar", name: "Arabic", nativeName: "العربية", rtl: true },
  { code: "ur", name: "Urdu", nativeName: "اردو", rtl: true },
  { code: "zh", name: "Chinese (Simplified)", nativeName: "简体中文", rtl: false },
];

async function postJSON<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) throw new Error((data.error as string) || `Request failed (HTTP ${res.status}).`);
  return data as T;
}

export function QuickTranslateBar({
  projectId,
  apiKey,
  onTranslationComplete,
  defaultLanguages,
}: {
  projectId?: number;
  apiKey?: string;
  onTranslationComplete?: () => void;
  /** Pre-selected target languages (e.g. the project's languages). */
  defaultLanguages?: string[];
}) {
  const [url, setUrl] = useState("");
  const [wholeSite, setWholeSite] = useState(false);
  const [maxPages, setMaxPages] = useState(10);
  const [targetLangs, setTargetLangs] = useState<string[]>(
    defaultLanguages && defaultLanguages.length ? defaultLanguages.slice(0, 10) : ["es", "ar", "ur"]
  );
  const [languages, setLanguages] = useState<Language[]>(FALLBACK_LANGUAGES);
  const [langJobs, setLangJobs] = useState<{ lang: string; id: number; state: JobState | null; error?: string; note?: string; frac?: number }[]>([]);
  const [rowsByLang, setRowsByLang] = useState<Record<string, ResultRow[]>>({});
  const [resultLang, setResultLang] = useState<string>("es");
  const [engineOnline, setEngineOnline] = useState<boolean | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [stages, setStages] = useState<Record<StageKey, { status: StageStatus; detail: string }> | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [summary, setSummary] = useState<{
    title: string;
    url: string;
    host: string;
    pages: number;
    extracted: number;
    unique: number;
    langs: string[];
  } | null>(null);
  const [copied, setCopied] = useState<"script" | "console" | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [domainState, setDomainState] = useState<{ loading: boolean; message: string | null; authorized: boolean }>({
    loading: false,
    message: null,
    authorized: false,
  });
  const abortRef = useRef<AbortController | null>(null);
  // Chrome's on-device translator: "auto" = use it when this browser has it, then LibreTranslate.
  const [engine, setEngine] = useState<"auto" | "server">("auto");
  // Read after hydration (false on the server) without a setState-in-effect.
  const chromeSupported = useSyncExternalStore(noopSubscribe, chromeTranslatorSupported, () => false);
  const chromeRef = useRef<Map<string, PreparedTranslator> | null>(null);
  const chromeCounts = useRef<Record<string, number>>({});
  /** Must run inside the click handler, before any await (Chrome needs the click to download a model). */
  const prepareChrome = (langs: string[]) => {
    chromeCounts.current = {};
    chromeRef.current =
      engine === "auto" && chromeSupported
        ? prepareChromeTranslators("en", langs, (lang, fraction) =>
            setLangJobs((prev) =>
              prev.map((x) => (x.lang === lang ? { ...x, note: `Downloading Chrome's language model… ${Math.round(fraction * 100)}%` } : x))
            )
          )
        : null;
  };
  // Pages of the last run, used by "Retry failed languages".
  const [lastPageIds, setLastPageIds] = useState<number[]>([]);

  useEffect(() => {
    fetch("/api/languages")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.languages) && d.languages.length) {
          setLanguages(d.languages);
          // Drop pre-selected codes the LibreTranslate server cannot translate.
          if (d.online) {
            const supported = new Set((d.languages as Language[]).map((l) => l.code));
            setTargetLangs((prev) => prev.filter((c) => supported.has(c)));
          }
        }
        setEngineOnline(Boolean(d.online));
        setEngineError(d.online ? null : d.error || "Translation server unreachable");
      })
      .catch(() => setEngineOnline(false));
  }, []);

  const noProject = !projectId || !apiKey;
  const isRtl = RTL_CODES.has(resultLang.split("-")[0]);
  const rows = rowsByLang[resultLang] || [];
  const langName = (code: string) => languages.find((l) => l.code === code)?.name || code.toUpperCase();
  const origin = usePublicAppOrigin();
  const snippet = apiKey ? buildEmbedSnippet({ apiKey, defaultLanguage: "en", origin }) : "";
  const consoleCommand = apiKey ? buildConsoleCommand(apiKey, origin) : "";

  const stage = (key: StageKey, status: StageStatus, detail = "") =>
    setStages((prev) => (prev ? { ...prev, [key]: { status, detail } } : prev));

  const copy = (text: string, which: "script" | "console") => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 2500);
    });
  };

  const cancel = () => abortRef.current?.abort();

  type CreatedJob = { id: number; total: number; targetLanguage: string };
  type LangResult = { lang: string; done: number; failed: number; total: number; error?: string; partial?: string };

  const mergeRows = (prev: Record<string, ResultRow[]>, lang: string, rows: ResultRow[]) => {
    const seen = new Set((prev[lang] || []).map((r) => r.stringId));
    return { ...prev, [lang]: [...(prev[lang] || []), ...rows.filter((r) => !seen.has(r.stringId))] };
  };

  /**
   * Translates the given pages into each language, one language and one page
   * at a time (LibreTranslate is CPU-bound, so parallel requests would not be
   * faster). Text shared by several pages (navigation, footer…) is translated
   * once: later pages only send what is still missing.
   */
  const translatePages = async (
    pageIds: number[],
    langs: string[],
    signal: AbortSignal,
    precreated?: CreatedJob[]
  ): Promise<LangResult[]> => {
    setLangJobs((prev) => {
      const next = [...prev];
      for (const lang of langs) {
        const entry = { lang, id: 0, state: null as JobState | null };
        const i = next.findIndex((x) => x.lang === lang);
        if (i >= 0) next[i] = entry;
        else next.push(entry);
      }
      return next;
    });
    const results: LangResult[] = [];
    for (let li = 0; li < langs.length; li++) {
      const lang = langs[li];
      let done = 0;
      let failed = 0;
      let total = 0;
      const errors: string[] = [];
      const pageLabel = (pi: number) => (pageIds.length > 1 ? `page ${pi + 1} of ${pageIds.length}` : "");
      const show = (s: JobState | null, pi: number) => {
        const state: JobState = {
          id: 0,
          status: "in_progress",
          total: total + (s?.total ?? 0),
          done: done + (s?.done ?? 0),
          failed: failed + (s?.failed ?? 0),
          remaining: s?.remaining ?? 0,
          lastError: s?.lastError ?? null,
        };
        setJob(state);
        const frac = (pi + (s && s.total > 0 ? (s.done + s.failed) / s.total : 0)) / pageIds.length;
        setLangJobs((prev) => prev.map((x) => (x.lang === lang ? { ...x, state, error: undefined, note: pageLabel(pi), frac } : x)));
        const where = [`${langName(lang)} (${li + 1} of ${langs.length})`, pageLabel(pi)].filter(Boolean).join(", ");
        stage("translate", "active", `${where}: ${state.done} / ${state.total} strings${state.failed ? ` (${state.failed} failed)` : ""}`);
      };
      for (let pi = 0; pi < pageIds.length; pi++) {
        if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
        try {
          let job = pi === 0 ? precreated?.find((j) => j.targetLanguage === lang) : undefined;
          if (!job) {
            const created = await postJSON<{ jobs: CreatedJob[] }>(
              "/api/jobs",
              { projectId, pageId: pageIds[pi], targetLanguages: [lang] },
              signal
            );
            job = created.jobs[0];
          }
          show(null, pi);
          // 1) Chrome's on-device translator in this browser (fast, free), when available.
          const prepared = chromeRef.current?.get(lang);
          if (prepared && job.total > 0) {
            const status = await prepared.availability;
            if (status !== "unavailable") {
              if (status !== "available") {
                setLangJobs((prev) => prev.map((x) => (x.lang === lang ? { ...x, note: "Downloading Chrome's language model (first time only)…" } : x)));
              }
              const tr = await prepared.translator;
              if (tr) {
                const r = await translateJobInBrowser(job.id, tr, { signal, onProgress: (s) => show(s, pi) });
                chromeCounts.current[lang] = (chromeCounts.current[lang] || 0) + r.translated;
              }
            }
          }
          // 2) LibreTranslate on the server for everything else.
          const final = await runJobToCompletion(job.id, { signal, onProgress: (s) => show(s, pi) });
          if (final.status === "failed") throw new Error(final.lastError || "Translation failed.");
          done += final.done;
          failed += final.failed;
          total += final.total;
          const res = await fetch(`/api/jobs/${job.id}?strings=1`, { signal });
          const data = await res.json();
          if (res.ok && Array.isArray(data.strings)) setRowsByLang((prev) => mergeRows(prev, lang, data.strings));
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") throw err;
          errors.push(`${pageLabel(pi) ? `${pageLabel(pi)}: ` : ""}${err instanceof Error ? err.message : String(err)}`);
        }
      }
      const allFailed = errors.length === pageIds.length;
      const finalState: JobState = {
        id: 0,
        status: errors.length || failed ? "completed_with_errors" : "completed",
        total,
        done,
        failed,
        remaining: 0,
        lastError: errors[0] ?? null,
      };
      setLangJobs((prev) =>
        prev.map((x) =>
          x.lang === lang
            ? {
                ...x,
                state: finalState,
                error: allFailed ? errors[0] : undefined,
                note:
                  errors.length && !allFailed
                    ? `${errors.length} page(s) failed`
                    : chromeCounts.current[lang]
                      ? `${chromeCounts.current[lang]} translated by Chrome on this computer, the rest by LibreTranslate or memory`
                      : undefined,
              }
            : x
        )
      );
      results.push({
        lang,
        done,
        failed,
        total,
        error: allFailed ? errors[0] : undefined,
        partial: errors.length && !allFailed ? errors.join("; ") : undefined,
      });
    }
    const allOk = results.every((r) => !r.error && !r.partial && !r.failed);
    stage(
      "translate",
      allOk ? "done" : "error",
      results
        .map((r) => `${langName(r.lang)}: ${r.error ? "failed" : `${r.done}/${r.total}${r.failed ? `, ${r.failed} failed` : ""}${r.partial ? ", some pages failed" : ""}`}`)
        .join(" · ")
    );
    return results;
  };

  const reportResults = (results: LangResult[]) => {
    const problems = results.filter((r) => r.error || r.partial);
    if (problems.length === results.length && results.every((r) => r.error)) {
      throw new Error(problems.map((f) => `${langName(f.lang)}: ${f.error}`).join("\n"));
    }
    if (problems.length) {
      setWarning(
        `Some translations could not be completed. Use “Retry failed languages” to try them again:\n${problems
          .map((f) => `${langName(f.lang)}: ${f.error || f.partial}`)
          .join("\n")}`
      );
    }
  };

  /** Re-runs only the languages that failed or have failed strings; finished work is kept. */
  const retryFailed = async () => {
    const langs = langJobs
      .filter((lj) => lj.error || (lj.note && /page(s) failed/.test(lj.note)) || (lj.state && lj.state.failed > 0))
      .map((lj) => lj.lang);
    prepareChrome(langs);
    if (!langs.length || !projectId || !lastPageIds.length) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError(null);
    setWarning(null);
    try {
      reportResults(await translatePages(lastPageIds, langs, controller.signal));
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      setError(aborted ? "Cancelled. Translations finished so far are saved." : err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const handleTranslate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!url.trim() || noProject) return;
    if (!targetLangs.length) {
      setError("Choose at least one target language.");
      return;
    }
    const langs = [...targetLangs];
    prepareChrome(langs);
    const controller = new AbortController();
    abortRef.current = controller;
    const signal = controller.signal;
    setRunning(true);
    setError(null);
    setWarning(null);
    setJob(null);
    setLangJobs([]);
    setRowsByLang({});
    setResultLang(langs[0]);
    setSummary(null);
    setDomainState({ loading: false, message: null, authorized: false });
    const initial: Record<StageKey, { status: StageStatus; detail: string }> = {
      connect: { status: "active", detail: "" },
      extract: { status: "pending", detail: "" },
      pages: { status: wholeSite ? "pending" : "done", detail: wholeSite ? "" : "Single page" },
      translate: { status: "pending", detail: "" },
      save: { status: "pending", detail: "" },
      script: { status: "pending", detail: "" },
    };
    setStages(initial);
    let current: StageKey = "connect";

    try {
      let pageIds: number[];
      let precreated: CreatedJob[] | undefined;
      if (!wholeSite) {
        const data = await postJSON<{
          page: { id: number; title: string; urlPath: string };
          extractedCount: number;
          uniqueCount: number;
          likelyClientRendered: boolean;
          jobs: { id: number; total: number; targetLanguage: string }[];
        }>("/api/translate-page", { url: url.trim(), projectId, targetLanguages: langs }, signal);
        stage("connect", "done", new URL(data.page.urlPath).host);
        stage("extract", "done", `${data.extractedCount} text items, ${data.uniqueCount} unique`);
        if (data.likelyClientRendered) setWarning("This page builds most of its content with JavaScript, so some text may be missing. Install the widget and visit the page: it reports text it finds, and you can translate it from the editor below.");
        setSummary({
          title: data.page.title,
          url: data.page.urlPath,
          host: new URL(data.page.urlPath).hostname,
          pages: 1,
          extracted: data.extractedCount,
          unique: data.uniqueCount,
          langs,
        });
        pageIds = [data.page.id];
        precreated = data.jobs;
      } else {
        const first = await postJSON<{
          baseUrl: string;
          firstPage: { id: number; title: string; urlPath: string; uniqueCount: number };
          pages: string[];
          likelyClientRendered: boolean;
        }>("/api/translate-website", { baseUrl: url.trim(), projectId, maxPages }, signal);
        stage("connect", "done", new URL(first.baseUrl).host);
        stage("extract", "done", `Start page: ${first.firstPage.uniqueCount} unique text items`);
        current = "pages";
        stage("pages", "active", `0 / ${first.pages.length} more pages`);
        let unique = first.firstPage.uniqueCount;
        let okPages = 1;
        const sitePageIds = [first.firstPage.id];
        const failures: string[] = [];
        for (let i = 0; i < first.pages.length; i++) {
          if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
          try {
            const r = await postJSON<{ saved: { pageId: number; uniqueCount: number } | null }>(
              "/api/extract",
              { url: first.pages[i], projectId, saveToDatabase: true },
              signal
            );
            unique += r.saved?.uniqueCount ?? 0;
            if (r.saved) sitePageIds.push(r.saved.pageId);
            okPages++;
          } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") throw err;
            failures.push(`${new URL(first.pages[i]).pathname}: ${err instanceof Error ? err.message : String(err)}`);
          }
          stage("pages", "active", `${i + 1} / ${first.pages.length} more pages`);
        }
        stage("pages", failures.length ? "error" : "done", `${okPages} page(s) extracted${failures.length ? `, ${failures.length} failed` : ""}`);
        if (failures.length) setWarning(`Some pages could not be extracted:\n${failures.slice(0, 5).join("\n")}`);
        setSummary({
          title: `Website (${okPages} pages)`,
          url: first.baseUrl,
          host: new URL(first.baseUrl).hostname,
          pages: okPages,
          extracted: unique,
          unique,
          langs,
        });
        pageIds = sitePageIds;
      }

      current = "translate";
      setLastPageIds(pageIds);
      reportResults(await translatePages(pageIds, langs, signal, precreated));
      stage("save", "done", "Approved translations saved");
      stage("script", "done", "Ready to install");
      onTranslationComplete?.();
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      setError(aborted ? "Cancelled. Translations finished so far are saved." : err instanceof Error ? err.message : String(err));
      stage(current, "error", aborted ? "Cancelled" : "");
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const authorizeSite = async () => {
    if (!summary || !projectId) return;
    setDomainState({ loading: true, message: null, authorized: false });
    try {
      const projectRes = await fetch(`/api/projects/${projectId}`);
      const projectData = await projectRes.json();
      if (!projectRes.ok) throw new Error(projectData.error || "Could not load project domains.");
      const domains: string[] = (projectData.domains || []).map((d: { domain: string }) => d.domain);
      if (!domains.some((d) => d.toLowerCase() === summary.host.toLowerCase())) domains.push(summary.host);
      const updateRes = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedDomains: domains }),
      });
      const updateData = await updateRes.json();
      if (!updateRes.ok) throw new Error(updateData.error || "Could not authorize this site.");
      setDomainState({ loading: false, message: `${summary.host} can now load translations.`, authorized: true });
    } catch (err) {
      setDomainState({ loading: false, message: err instanceof Error ? err.message : String(err), authorized: false });
    }
  };

  const STAGE_LABELS: Record<StageKey, string> = {
    connect: "Connecting to website",
    extract: "Downloading & extracting text",
    pages: "Discovering & extracting more pages",
    translate: "Translating unique strings",
    save: "Saving translations",
    script: "Generating installation script",
  };

  const pct = job && job.total > 0 ? Math.round(((job.done + job.failed) / job.total) * 100) : null;
  const finished = stages?.script.status === "done";

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-6">
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Translate a website</h2>
            <p className="text-sm text-slate-500 mt-1">
              Enter a URL and choose one or more languages. WebLingo extracts the visible text, translates each unique string once with your LibreTranslate server, and publishes it to your widget.
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-2 self-start text-xs font-medium px-3 py-1.5 rounded-full border ${
              engineOnline === null
                ? "bg-slate-50 text-slate-500 border-slate-200"
                : engineOnline
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-red-50 text-red-700 border-red-200"
            }`}
            title={engineError || undefined}
          >
            <span className={`w-2 h-2 rounded-full ${engineOnline === null ? "bg-slate-400" : engineOnline ? "bg-emerald-500" : "bg-red-500"}`} />
            {engineOnline === null ? "Checking translation server…" : engineOnline ? "Translation server online" : "Translation server offline"}
          </span>
        </div>

        {noProject && (
          <div className="mb-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
            Create a project first (Projects → New project). Translations and the widget key belong to a project.
          </div>
        )}

        <form onSubmit={handleTranslate} className="space-y-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <label className="relative flex-1">
              <span className="sr-only">Website URL</span>
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zM3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
                </svg>
              </span>
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                disabled={running}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-all"
              />
            </label>

            <div className="lg:w-[340px]">
              <LanguageMultiSelect languages={languages} value={targetLangs} onChange={setTargetLangs} disabled={running} />
            </div>

            {running ? (
              <button
                type="button"
                onClick={cancel}
                className="px-7 py-3 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm rounded-xl transition-all cursor-pointer whitespace-nowrap"
              >
                Cancel
              </button>
            ) : (
              <button
                type="submit"
                disabled={!url.trim() || noProject || targetLangs.length === 0}
                className="px-7 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-sm rounded-xl shadow-sm shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer whitespace-nowrap"
              >
                {wholeSite ? "Analyze & translate site" : "Analyze & translate page"}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-600">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={wholeSite} onChange={(e) => setWholeSite(e.target.checked)} disabled={running} className="accent-blue-600" />
              Translate whole website (same-domain pages linked from this URL)
            </label>
            {wholeSite && (
              <label className="flex items-center gap-2">
                Max pages
                <input
                  type="number"
                  min={1}
                  max={25}
                  value={maxPages}
                  onChange={(e) => setMaxPages(Math.min(25, Math.max(1, Number(e.target.value) || 1)))}
                  disabled={running}
                  className="w-16 px-2 py-1 border border-slate-300 rounded-lg"
                />
              </label>
            )}
            <label className="flex items-center gap-2">
              Engine
              <select
                value={engine}
                onChange={(e) => setEngine(e.target.value as "auto" | "server")}
                disabled={running}
                className="px-2 py-1 border border-slate-300 rounded-lg bg-white text-slate-700"
              >
                <option value="auto">Chrome on this computer first, then LibreTranslate</option>
                <option value="server">LibreTranslate server only</option>
              </select>
            </label>
          </div>
          {engine === "auto" && (
            <p className="text-xs text-slate-500">
              {chromeSupported
                ? "Chrome's built-in translator runs on this computer: free and usually much faster. Languages it does not offer, and sentences where it would drop a link, go to LibreTranslate automatically. The first time, Chrome downloads a model for each language."
                : "Chrome's built-in translator is not available in this browser (it needs desktop Chrome 138 or newer on an HTTPS page), so LibreTranslate is used."}
            </p>
          )}
        </form>

        {stages && (
          <ol className="mt-6 grid gap-2" aria-live="polite">
            {(Object.keys(STAGE_LABELS) as StageKey[]).map((key) => {
              const s = stages[key];
              if (key === "pages" && !wholeSite) return null;
              return (
                <li key={key} className="flex items-start gap-3 text-sm">
                  <span
                    className={`mt-0.5 w-5 h-5 shrink-0 rounded-full grid place-items-center text-[11px] font-bold ${
                      s.status === "done"
                        ? "bg-emerald-100 text-emerald-700"
                        : s.status === "active"
                          ? "bg-blue-100 text-blue-700"
                          : s.status === "error"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-400"
                    }`}
                    aria-hidden="true"
                  >
                    {s.status === "done" ? "✓" : s.status === "error" ? "!" : s.status === "active" ? <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" /> : ""}
                  </span>
                  <span className={s.status === "pending" ? "text-slate-400" : "text-slate-800"}>
                    {STAGE_LABELS[key]}
                    {s.detail && <span className="block text-xs text-slate-500">{s.detail}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {langJobs.length > 0 && (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2" aria-label="Progress per language">
            {langJobs.map((lj) => {
              const s = lj.state;
              const done = s && ["completed", "completed_with_errors"].includes(s.status);
              const p = done
                ? 100
                : typeof lj.frac === "number"
                  ? Math.round(lj.frac * 100)
                  : s && s.total > 0
                    ? Math.round(((s.done + s.failed) / s.total) * 100)
                    : 0;
              return (
                <li key={lj.lang} className="p-3 rounded-xl border border-slate-200 bg-slate-50/60">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span>{langName(lj.lang)}</span>
                    <span className={lj.error ? "text-red-600" : s?.failed ? "text-amber-700" : done ? "text-emerald-700" : "text-slate-500"}>
                      {lj.error ? "Failed" : !s ? "Waiting" : done ? (s.total ? `${s.done}/${s.total}${s.failed ? ` · ${s.failed} failed` : ""}` : "Already translated") : `${s.done + s.failed}/${s.total}`}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-slate-200 overflow-hidden" role="progressbar" aria-label={langName(lj.lang)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p}>
                    <div className={`h-full transition-all duration-500 ${lj.error ? "bg-red-500" : s?.failed ? "bg-amber-500" : "bg-blue-600"}`} style={{ width: `${lj.error ? 100 : p}%` }} />
                  </div>
                  {lj.note && !lj.error && <p className="mt-1 text-[11px] text-slate-500">{lj.note}</p>}
                  {lj.error && <p className="mt-1 text-[11px] text-red-700">{lj.error}</p>}
                </li>
              );
            })}
          </ul>
        )}
        {job && job.total > 0 && pct !== null && !finished && (
          <p className="mt-2 text-xs text-slate-500">
            Languages are translated one after another; speed depends on your LibreTranslate server (about 2–4 strings per second).
          </p>
        )}

        {warning && (
          <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm whitespace-pre-line">{warning}</div>
        )}
        {!running && langJobs.some((lj) => lj.error || (lj.state && lj.state.failed > 0)) && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={retryFailed}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold shadow-sm transition-colors cursor-pointer"
            >
              Retry failed languages
            </button>
            <span className="text-xs text-slate-500">Finished translations are kept; only missing or failed strings are sent again.</span>
          </div>
        )}
        {error && (
          <div role="alert" className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">
            {error}
          </div>
        )}
        {finished && langJobs.some((lj) => lj.state && lj.state.failed > 0) && (
          <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
            Some strings could not be translated (
            {langJobs
              .filter((lj) => lj.state && lj.state.failed > 0)
              .map((lj) => `${langName(lj.lang)}: ${lj.state!.failed}${lj.state!.lastError ? `, ${lj.state!.lastError}` : ""}`)
              .join("; ")}
            ). Their original text stays on the website. Run the translation again to retry, or edit them in the translation editor.
          </div>
        )}
      </div>

      {finished && summary && apiKey && (
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 rounded-2xl shadow-lg border border-slate-800 text-white p-6 md:p-8 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
            <div>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold text-xs">
                Installation script
              </span>
              <h3 className="text-lg font-bold text-white mt-2">Add the language switcher to {summary.host}</h3>
              <p className="text-xs text-slate-300 mt-1">
                {summary.pages} page(s) · {summary.unique} unique strings · translated into {summary.langs.map(langName).join(", ")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-slate-200 transition-colors cursor-pointer self-start"
              aria-expanded={showGuide}
            >
              Test before installing {showGuide ? "▲" : "▼"}
            </button>
          </div>

          <ol className="list-decimal list-inside text-xs text-slate-300 space-y-1">
            <li>Authorize the site so its pages may load translations.</li>
            <li>Paste the script into the <code className="bg-black/40 px-1 rounded text-amber-300">&lt;head&gt;</code> of every page (or your site template).</li>
            <li>Reload the site: a language button appears in the bottom-right corner.</li>
          </ol>

          <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-100">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={authorizeSite}
                disabled={domainState.loading || domainState.authorized}
                className="rounded-lg bg-amber-300 px-3 py-1.5 font-semibold text-slate-900 disabled:opacity-60 cursor-pointer"
              >
                {domainState.loading ? "Authorizing…" : domainState.authorized ? "Site authorized" : `Authorize ${summary.host}`}
              </button>
              <a className="underline" href={`/projects/${projectId}`}>Manage domains</a>
            </div>
            {domainState.message && <p role="status" className="mt-2">{domainState.message}</p>}
          </div>

          <div className="relative">
            <pre className="p-4 pr-28 bg-black/60 rounded-xl text-xs font-mono text-emerald-300 overflow-x-auto whitespace-pre leading-relaxed border border-slate-800">{snippet}</pre>
            <button
              type="button"
              onClick={() => copy(snippet, "script")}
              className="absolute top-3 right-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
            >
              {copied === "script" ? "Copied!" : "Copy script"}
            </button>
          </div>

          {showGuide && (
            <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 text-xs space-y-2 text-slate-300">
              <p>Try the widget on the live site without editing it: open {summary.host} in Chrome or Edge, press F12, open the Console tab, paste this and press Enter. (Authorize the site first.)</p>
              <div className="relative">
                <pre className="p-3 pr-24 bg-black rounded-lg font-mono text-[11px] text-emerald-300 overflow-x-auto">{consoleCommand}</pre>
                <button
                  type="button"
                  onClick={() => copy(consoleCommand, "console")}
                  className="absolute top-2 right-2 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-[11px] cursor-pointer"
                >
                  {copied === "console" ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-slate-400">Sites with a strict Content-Security-Policy may block scripts from other domains; add your WebLingo domain to their script-src and connect-src.</p>
            </div>
          )}
        </div>
      )}

      {Object.keys(rowsByLang).length > 0 && summary && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 md:p-8 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">{summary.title}</h3>
              <p className="text-xs text-slate-500 mt-1 font-mono break-all">
                {summary.url} → {langName(resultLang)}
              </p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 font-mono text-slate-700 self-start">
              {isRtl ? "Right-to-left" : "Left-to-right"}
            </span>
          </div>
          <div role="tablist" aria-label="Result language" className="flex flex-wrap gap-1.5 p-1 bg-slate-100 rounded-xl w-fit">
            {summary.langs.map((code) => (
              <button
                key={code}
                type="button"
                role="tab"
                aria-selected={resultLang === code}
                disabled={!rowsByLang[code]}
                onClick={() => setResultLang(code)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-default ${
                  resultLang === code ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {langName(code)}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4 w-1/2">Original</th>
                  <th className="py-3 px-4 w-1/2">Translation</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.stringId} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 text-slate-800 align-top">
                      <p>{skeletonToDisplay(row.sourceText)}</p>
                      {row.contextHint && (
                        <span className="inline-block mt-1 text-[11px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{row.contextHint}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 align-top">
                      <p dir={isRtl ? "rtl" : "ltr"} className={isRtl ? "text-right text-base" : ""}>
                        {row.status === "failed" || !row.translatedText ? <span className="text-slate-400">—</span> : skeletonToDisplay(row.translatedText)}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-right align-top whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                          row.status === "approved"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : row.status === "failed"
                              ? "bg-red-50 text-red-700 border-red-200"
                              : "bg-slate-50 text-slate-600 border-slate-200"
                        }`}
                      >
                        {row.status === "approved" ? "Approved" : row.status === "failed" ? "Failed" : row.status || "Pending"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
