"use client";

import React, { useState } from "react";

const LANG_OPTIONS = [
  { code: "es", name: "Spanish", native: "Español" },
  { code: "fr", name: "French", native: "Français" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "ar", name: "Arabic (RTL)", native: "العربية" },
  { code: "ur", name: "Urdu (RTL)", native: "اردو" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "zh", name: "Chinese", native: "中文" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "ko", name: "Korean", native: "한국어" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "tr", name: "Turkish", native: "Türkçe" },
  { code: "nl", name: "Dutch", native: "Nederlands" },
  { code: "pl", name: "Polish", native: "Polski" },
  { code: "he", name: "Hebrew (RTL)", native: "עברית" },
  { code: "fa", name: "Persian (RTL)", native: "فارسی" },
  { code: "bn", name: "Bengali", native: "বাংলা" },
  { code: "th", name: "Thai", native: "ไทย" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia" },
  { code: "ms", name: "Malay", native: "Bahasa Melayu" },
  { code: "uk", name: "Ukrainian", native: "Українська" },
  { code: "el", name: "Greek", native: "Ελληνικά" },
  { code: "cs", name: "Czech", native: "Čeština" },
  { code: "ro", name: "Romanian", native: "Română" },
  { code: "hu", name: "Hungarian", native: "Magyar" },
  { code: "sv", name: "Swedish", native: "Svenska" },
];

export function WidgetSnippetCard({
  apiKey = "wl_live_demo_key_77889900aabbccdd",
  projectName = "Apex Global Technology",
}: {
  apiKey?: string;
  projectName?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState<string[]>(["es", "fr", "de", "ar", "ur"]);
  const [showPicker, setShowPicker] = useState(false);

  const toggle = (code: string) => {
    setSelected(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "https://YOUR-DOMAIN";
  const langs = selected.length > 0 ? selected.join(",") : "es";
  const snippet = `<!-- WebLingo Website Translation Widget -->\n<script src="${origin}/widget.js" data-project-key="${apiKey}" data-api-url="${origin}" data-languages="${langs}" async></script>`;

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <span className="text-emerald-400">⚡</span> Embeddable Website Translation Snippet
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Choose which languages the widget should offer, then copy the snippet into your site <code className="text-slate-300 font-mono">&lt;head&gt;</code>.
          </p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded bg-slate-800 text-slate-300 font-mono">
          Project: {projectName}
        </span>
      </div>

      {/* Language picker */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setShowPicker(!showPicker)}
          className="flex items-center gap-2 text-xs font-semibold text-slate-200 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
        >
          <span>🌐</span>
          <span>Selected languages ({selected.length}): {selected.join(", ") || "none"}</span>
          <span>{showPicker ? "▲" : "▼"}</span>
        </button>
        {showPicker && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 p-4 rounded-2xl bg-slate-950 border border-slate-800 max-h-64 overflow-y-auto">
            {LANG_OPTIONS.map(l => (
              <label key={l.code} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={selected.includes(l.code)}
                  onChange={() => toggle(l.code)}
                  className="accent-blue-500"
                />
                <span>{l.name}</span>
                <span className="text-slate-500 font-mono text-[10px]">({l.code})</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <pre className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-400 overflow-x-auto whitespace-pre-wrap leading-relaxed">
          {snippet}
        </pre>
        <button
          type="button"
          onClick={handleCopy}
          className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow transition-all cursor-pointer"
        >
          {copied ? "Copied to Clipboard!" : "Copy Snippet"}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-400">
        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
          <span className="font-semibold text-slate-200">1. Instant Language Switcher</span>
          <p className="text-[11px] text-slate-500">Floating widget attaches automatically to bottom-right corner.</p>
        </div>
        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
          <span className="font-semibold text-slate-200">2. Pre-Approved Delivery</span>
          <p className="text-[11px] text-slate-500">Only verified translations are loaded. Zero runtime API calls.</p>
        </div>
        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
          <span className="font-semibold text-slate-200">3. Automatic RTL Toggle</span>
          <p className="text-[11px] text-slate-500">Toggles dir=&quot;rtl&quot; on html element for Arabic, Urdu, Hebrew, Persian.</p>
        </div>
      </div>
    </section>
  );
}