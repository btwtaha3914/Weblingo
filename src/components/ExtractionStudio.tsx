"use client";

import React, { useState } from "react";

interface ExtractedItem {
  contentHash: string;
  sourceText: string;
  wordCount: number;
  contextHint: string;
}

export function ExtractionStudio({ projectId = 1 }: { projectId?: number }) {
  const [mode, setMode] = useState<"url" | "html">("url");
  const [targetUrl, setTargetUrl] = useState("https://example.com");
  const [rawHtml, setRawHtml] = useState(
    `<main>\n  <h1>Apex Global Localization</h1>\n  <p>We empower teams to translate web content into Arabic, Urdu, and Spanish without expensive recurring subscription fees.</p>\n  <button>Get Started Now</button>\n  <p>Contact our support team for help.</p>\n</main>`
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [extractedStrings, setExtractedStrings] = useState<ExtractedItem[]>([]);
  const [pageTitle, setPageTitle] = useState<string>("");

  const handleExtract = async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const payload: Record<string, unknown> = {
        projectId,
        saveToDatabase: true,
      };

      if (mode === "url") {
        payload.url = targetUrl.trim();
      } else {
        payload.html = rawHtml;
        payload.url = "https://custom-preview.local/page";
      }

      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Extraction failed.");
      }

      setExtractedStrings(data.result.strings || []);
      setPageTitle(data.result.title || "Page Content");
      setSuccessMsg(
        `Successfully extracted and deduplicated ${data.result.stringCount} unique strings in ${data.result.durationMs}ms.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <span className="text-blue-400">🔍</span> Safe Webpage Text Extraction Studio
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            SSRF-protected content parser that isolates translatable structural elements, strips tags/scripts, and creates SHA-256 deduplicated records.
          </p>
        </div>

        <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setMode("url")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              mode === "url" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white"
            }`}
          >
            Live Webpage URL
          </button>
          <button
            type="button"
            onClick={() => setMode("html")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              mode === "html" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white"
            }`}
          >
            Raw HTML Markup
          </button>
        </div>
      </div>

      {mode === "url" ? (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-400 flex items-center justify-between">
            <span>Website Page URL</span>
            <span className="text-emerald-400 font-mono text-[11px]">SSRF Protection Active</span>
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="url"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              className="flex-1 rounded-xl bg-slate-950 border border-slate-800 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono"
              placeholder="https://example.com/about"
            />
            <button
              type="button"
              onClick={handleExtract}
              disabled={loading}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold text-white shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50 text-sm whitespace-nowrap cursor-pointer"
            >
              {loading ? "Extracting..." : "Fetch & Extract"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-400 flex items-center justify-between">
            <span>HTML Markup Input</span>
            <span className="text-slate-500 font-mono">{rawHtml.length} characters</span>
          </label>
          <textarea
            value={rawHtml}
            onChange={(e) => setRawHtml(e.target.value)}
            rows={5}
            className="w-full rounded-2xl bg-slate-950 border border-slate-800 p-4 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
          />
          <button
            type="button"
            onClick={handleExtract}
            disabled={loading}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold text-white shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50 text-sm cursor-pointer"
          >
            {loading ? "Parsing..." : "Extract Text Elements"}
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
          {successMsg}
        </div>
      )}

      {/* Extracted strings table */}
      {extractedStrings.length > 0 && (
        <div className="space-y-3 pt-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">
              Extracted Elements for: &quot;{pageTitle}&quot; ({extractedStrings.length} strings)
            </h3>
            <span className="text-[11px] font-mono text-slate-400">Deduplicated with SHA-256</span>
          </div>

          <div className="max-h-72 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/70 divide-y divide-slate-800/60">
            {extractedStrings.map((s, idx) => (
              <div key={idx} className="p-3.5 flex items-start justify-between gap-4 text-xs hover:bg-slate-900/50">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 font-mono text-[10px] uppercase">
                      {s.contextHint}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">
                      hash: {s.contentHash.slice(0, 10)}...
                    </span>
                    <span className="text-[10px] text-slate-400">{s.wordCount} words</span>
                  </div>
                  <p className="text-slate-200 text-sm">{s.sourceText}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
