"use client";

import React, { useState } from "react";

interface TranslatedStringItem {
  stringId: number;
  sourceText: string;
  translatedText: string;
  status: string;
  contextHint: string | null;
}

const SUPPORTED_LANGUAGES = [
  { code: "es", name: "Spanish", native: "Español", rtl: false, flag: "🇪🇸" },
  { code: "ar", name: "Arabic", native: "العربية", rtl: true, flag: "🇸🇦" },
  { code: "ur", name: "Urdu", native: "اردو", rtl: true, flag: "🇵🇰" },
  { code: "fr", name: "French", native: "Français", rtl: false, flag: "🇫🇷" },
  { code: "de", name: "German", native: "Deutsch", rtl: false, flag: "🇩🇪" },
  { code: "it", name: "Italian", native: "Italiano", rtl: false, flag: "🇮🇹" },
];

export function QuickTranslateBar({
  projectId = 1,
  apiKey = "wl_live_demo_key_77889900aabbccdd",
  onTranslationComplete,
}: {
  projectId?: number;
  apiKey?: string;
  onTranslationComplete?: () => void;
}) {
  const [url, setUrl] = useState("");
  const [wholeSite, setWholeSite] = useState(false);
  const [targetLang, setTargetLang] = useState("es");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedConsole, setCopiedConsole] = useState(false);
  const [showInspectGuide, setShowInspectGuide] = useState(false);
  const [results, setResults] = useState<{
    pageTitle: string;
    url: string;
    count: number;
    targetLang: string;
    isRtl: boolean;
    siteHost: string;
    strings: TranslatedStringItem[];
  } | null>(null);
  const [domainAuthorization, setDomainAuthorization] = useState<{ loading: boolean; message: string | null; authorized: boolean }>({
    loading: false,
    message: null,
    authorized: false,
  });

  const sampleUrls = [
    { label: "Apex Demo Site", url: "https://demo.weblingo.local" },
    { label: "Example.com", url: "https://example.com" },
  ];

  // Use the public server URL (reachable by end clients) for the widget snippet.
  // Falls back to window.location.origin when NEXT_PUBLIC_APP_URL is not configured.
  const appOrigin =
    (typeof process !== "undefined" &&
      process.env.NEXT_PUBLIC_APP_URL &&
      String(process.env.NEXT_PUBLIC_APP_URL).trim() !== ""
      ? String(process.env.NEXT_PUBLIC_APP_URL).replace(/\/+$/, "")
      : typeof window !== "undefined"
        ? window.location.origin
        : "https://YOUR-DOMAIN");
  const scriptTag = `<script src="${appOrigin}/widget.js" data-project-key="${apiKey}" data-api-url="${appOrigin}" data-languages="${targetLang}" async></script>`;
  const consoleCommand = `const s = document.createElement("script"); s.src = "${appOrigin}/widget.js"; s.setAttribute("data-project-key", "${apiKey}"); s.setAttribute("data-api-url", "${appOrigin}"); s.setAttribute("data-languages", "${targetLang}"); document.head.appendChild(s);`;

  const handleCopyScript = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(scriptTag);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2500);
    }
  };

  const handleCopyConsole = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(consoleCommand);
      setCopiedConsole(true);
      setTimeout(() => setCopiedConsole(false), 2500);
    }
  };

  const handleTranslatePage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const endpoint = wholeSite ? "/api/translate-website" : "/api/translate-page";
      const bodyPayload = wholeSite
        ? { baseUrl: url.trim(), projectId, targetLanguage: targetLang, maxPages: 10 }
        : { url: url.trim(), projectId, targetLanguage: targetLang, autoTranslate: true, autoApprove: true };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch and translate webpage.");
      }

      if (wholeSite) {
        setResults({
          pageTitle: `Whole website (${data.pagesProcessed} pages)`,
          url: data.baseUrl,
          count: data.totalTranslated,
          targetLang: data.targetLanguage,
          isRtl: ["ar", "ur", "he", "fa"].includes(data.targetLanguage),
          siteHost: new URL(data.baseUrl).hostname,
          strings: [],
        });
      } else {
        setResults({
          pageTitle: data.page?.title || "Webpage Content",
          url: data.page?.urlPath || url,
          count: data.translatedCount || data.extractedCount,
          targetLang: data.targetLanguage,
          isRtl: Boolean(data.isRtl),
          siteHost: new URL(data.page?.urlPath || url).hostname,
          strings: data.strings || [],
        });
      }
      setDomainAuthorization({ loading: false, message: null, authorized: false });

      if (onTranslationComplete) {
        onTranslationComplete();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const authorizeTranslatedSite = async () => {
    if (!results) return;
    setDomainAuthorization({ loading: true, message: null, authorized: false });

    try {
      const projectRes = await fetch(`/api/projects/${projectId}`);
      const projectData = await projectRes.json();
      if (!projectRes.ok) throw new Error(projectData.error || "Could not load project domains.");

      const domains = (projectData.domains || []).map((item: { domain: string }) => item.domain);
      if (!domains.some((domain: string) => domain.toLowerCase() === results.siteHost.toLowerCase())) {
        domains.push(results.siteHost);
      }

      const updateRes = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedDomains: domains }),
      });
      const updateData = await updateRes.json();
      if (!updateRes.ok) throw new Error(updateData.error || "Could not authorize this site.");

      setDomainAuthorization({ loading: false, message: `${results.siteHost} is authorized for this project.`, authorized: true });
    } catch (err) {
      setDomainAuthorization({
        loading: false,
        message: err instanceof Error ? err.message : String(err),
        authorized: false,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Primary Input Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 md:p-8">
        <div className="max-w-2xl mb-6">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Translate Any Webpage
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Enter a webpage URL and select target language. WebLingo will extract all readable text, translate it instantly, and automatically approve it for your website widget.
          </p>
        </div>

        <form onSubmit={handleTranslatePage} className="space-y-4">
          <div className="flex flex-col lg:flex-row gap-3">
            {/* URL Input */}
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a8.997 8.997 0 01-7.843-4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.033-1.2-8.284-3.247M3 12c0-.778.099-1.533.284-2.253" />
                </svg>
              </span>
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Enter URL to translate, e.g. https://example.com"
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-all font-sans"
              />
            </div>

            {/* Language Selector Dropdown */}
            <div className="relative min-w-[200px]">
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className="w-full appearance-none bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 font-medium focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-all cursor-pointer pr-10"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.name} ({lang.native}) {lang.rtl ? "• RTL" : ""}
                  </option>
                ))}
              </select>
              <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </div>

            {/* Whole-site toggle */}
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={wholeSite}
                onChange={(e) => setWholeSite(e.target.checked)}
                className="accent-blue-600"
              />
              Translate whole website
            </label>

            {/* Translate Button */}
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="px-7 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-sm rounded-xl shadow-sm shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>Translating Page...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                  </svg>
                  <span>Translate Webpage</span>
                </>
              )}
            </button>
          </div>

          {/* Quick presets & helper note */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 pt-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-600">Quick Test URLs:</span>
              {sampleUrls.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setUrl(s.url);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors font-mono cursor-pointer"
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 text-slate-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Auto-Approval Active • Live on Widget Instantly</span>
            </div>
          </div>
        </form>

        {error && (
          <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center gap-2">
            <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Generated Installation Script & Testing Card (Appears as soon as translated) */}
      {results && (
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 rounded-2xl shadow-lg border border-slate-800 text-white p-6 md:p-8 space-y-5 animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold text-xs">
                  ✓ Generated Installation Script
                </span>
                <span className="text-xs text-slate-400">Ready to add to website header</span>
              </div>
              <h3 className="text-lg font-bold text-white mt-1">
                Display Translations on Your Website
              </h3>
            </div>

            <button
              type="button"
              onClick={() => setShowInspectGuide(!showInspectGuide)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap self-start sm:self-auto"
            >
              <span>🔍 How to test using Inspect / DevTools</span>
              <span>{showInspectGuide ? "▲" : "▼"}</span>
            </button>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            Copy and paste this script tag into the <code className="bg-black/40 px-1.5 py-0.5 rounded text-amber-300 font-mono">&lt;head&gt;</code> of your website. A discreet language switcher will automatically appear in the bottom-right corner, letting visitors browse your site in {results.targetLang.toUpperCase()} with full {results.isRtl ? "RTL layout" : "styling"}.
          </p>

          <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-100">
            <strong>Before installing:</strong> authorize <code className="font-mono">{results.siteHost}</code> for this project. Only authorize a site you control.
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button type="button" onClick={authorizeTranslatedSite} disabled={domainAuthorization.loading || domainAuthorization.authorized} className="rounded-lg bg-amber-300 px-3 py-1.5 font-semibold text-slate-900 disabled:opacity-60">
                {domainAuthorization.loading ? "Authorizing…" : domainAuthorization.authorized ? "Site authorized" : "Authorize this site"}
              </button>
              <a className="underline" href={`/projects/${projectId}`}>Manage project domains</a>
              <span>The WebLingo server must be reachable by visitors. A private LAN URL only works on that network; public HTTPS sites require WebLingo to use HTTPS.</span>
            </div>
            {domainAuthorization.message && <p role="status" className="mt-2">{domainAuthorization.message}</p>}
          </div>

          {/* Copyable Script Tag */}
          <div className="relative">
            <pre className="p-4 bg-black/60 rounded-xl text-xs font-mono text-emerald-400 overflow-x-auto whitespace-pre-wrap leading-relaxed border border-slate-800">
              {scriptTag}
            </pre>
            <button
              type="button"
              onClick={handleCopyScript}
              className="absolute top-3 right-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all cursor-pointer"
            >
              {copiedScript ? "Copied Script!" : "Copy Code"}
            </button>
          </div>

          {/* Collapsible Step-by-Step Inspect / DevTools Testing Guide */}
          {showInspectGuide && (
            <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 text-xs space-y-3">
              <h4 className="font-bold text-amber-400 text-sm flex items-center gap-2">
                <span>🛠️</span>
                <span>How to Test on ANY Website in 10 Seconds using Browser Inspect:</span>
              </h4>

              <ol className="list-decimal list-inside space-y-2 text-slate-300 leading-relaxed">
                <li>
                  <strong>Open any webpage in Google Chrome or Edge</strong> (e.g. your own website, or <code className="text-white bg-slate-800 px-1 rounded">https://example.com</code>).
                </li>
                <li>
                  Right-click anywhere on that webpage and choose <strong>Inspect</strong> (or press <kbd className="bg-slate-800 px-1 rounded font-mono">F12</kbd> / <kbd className="bg-slate-800 px-1 rounded font-mono">Cmd+Option+I</kbd>).
                </li>
                <li>
                  Click the <strong>Console</strong> tab in the developer tools panel.
                </li>
                <li>
                  Paste this 1-line command into the Console and press <strong>Enter</strong>:
                  <div className="relative mt-2">
                    <pre className="p-3 bg-black rounded-lg font-mono text-[11px] text-emerald-300 overflow-x-auto">
                      {consoleCommand}
                    </pre>
                    <button
                      type="button"
                      onClick={handleCopyConsole}
                      className="absolute top-2 right-2 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-[11px] font-mono cursor-pointer"
                    >
                      {copiedConsole ? "Copied!" : "Copy 1-Line Test Command"}
                    </button>
                  </div>
                </li>
                <li>
                  <strong>Result:</strong> The WebLingo language selector immediately appears on that webpage! Switch languages to see your approved translations applied live to the text elements.
                </li>
              </ol>
            </div>
          )}
        </div>
      )}

      {/* Translation Results Table */}
      {results && results.strings && results.strings.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 md:p-8 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-600 text-base">✓</span>
                <h3 className="text-lg font-bold text-slate-900">
                  {results.pageTitle}
                </h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                  {results.count} Lines Auto-Approved
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 font-mono">
                {results.url} ➔ Translated into {results.targetLang.toUpperCase()}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Target Script:</span>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-100 font-mono text-slate-700">
                {results.isRtl ? "Right-to-Left (RTL)" : "Left-to-Right (LTR)"}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4 w-1/2">Original Source (English)</th>
                  <th className="py-3 px-4 w-1/2">
                    Auto-Translated ({results.targetLang.toUpperCase()})
                  </th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.strings.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 text-slate-800 align-top leading-relaxed font-sans">
                      <p>{row.sourceText}</p>
                      {row.contextHint && (
                        <span className="inline-block mt-1 text-[11px] font-mono text-slate-400 uppercase bg-slate-100 px-1.5 py-0.5 rounded">
                          {row.contextHint}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 align-top leading-relaxed">
                      <div
                        dir={results.isRtl ? "rtl" : "ltr"}
                        className={`text-slate-900 font-sans ${
                          results.isRtl
                            ? "text-right font-medium text-base text-slate-900"
                            : ""
                        }`}
                      >
                        {row.translatedText}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right align-top whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        Approved
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
