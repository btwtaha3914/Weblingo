"use client";

import React, { useState } from "react";

export function WidgetEmbedModal({ apiKey = "wl_live_demo_key_77889900aabbccdd" }: { apiKey?: string }) {
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(["es", "fr", "de", "ar", "ur"]);

  const toggle = (code: string) =>
    setSelected(prev => (prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]));

  // Use the public server URL (reachable by end clients) for the widget snippet.
  // Falls back to window.location.origin when NEXT_PUBLIC_APP_URL is not configured.
  const origin =
    (typeof process !== "undefined" &&
      process.env.NEXT_PUBLIC_APP_URL &&
      String(process.env.NEXT_PUBLIC_APP_URL).trim() !== ""
      ? String(process.env.NEXT_PUBLIC_APP_URL).replace(/\/+$/, "")
      : typeof window !== "undefined"
        ? window.location.origin
        : "https://YOUR-DOMAIN");
  const langs = selected.length > 0 ? selected.join(",") : "es";
  const snippet = `<!-- WebLingo Instant Website Translation Widget -->\n<script src="${origin}/widget.js" data-project-key="${apiKey}" data-api-url="${origin}" data-languages="${langs}" async></script>`;

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-sm transition-all cursor-pointer"
      >
        <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
        <span>Widget Snippet</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Embed Translation Widget</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Paste this snippet into your website HTML to let visitors switch languages.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700">Languages to offer in the widget:</p>
              <div className="grid grid-cols-3 gap-1 max-h-32 overflow-y-auto p-2 rounded-xl border border-slate-200 bg-slate-50">
                {["es","fr","de","it","pt","ar","ur","he","fa","ru","zh","ja","ko","hi","tr","nl","pl","sv","bn","th","vi","id","ms","uk","el","cs","ro","hu"].map(code => (
                  <label key={code} className="flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={selected.includes(code)} onChange={() => toggle(code)} className="accent-blue-500" />
                    {code}
                  </label>
                ))}
              </div>
            </div>

            <div className="relative">
              <pre className="p-4 bg-slate-900 text-emerald-400 rounded-xl text-xs font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
                {snippet}
              </pre>
              <button
                type="button"
                onClick={handleCopy}
                className="absolute top-3 right-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium shadow-sm transition-all cursor-pointer"
              >
                {copied ? "Copied!" : "Copy Code"}
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-800">How it works:</p>
              <ul className="list-disc list-inside space-y-0.5 text-slate-600">
                <li>Displays a discreet floating language selector at the bottom corner.</li>
                <li>Fetches pre-approved translations in real-time.</li>
                <li>Applies RTL layout automatically for Arabic and Urdu.</li>
              </ul>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
