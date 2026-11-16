"use client";

import React, { useState } from "react";
import { buildEmbedSnippet, usePublicAppOrigin } from "@/lib/client-utils";
import { LanguageMultiSelect } from "@/components/LanguageMultiSelect";

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
  apiKey,
  projectName = "Apex Global Technology",
}: {
  apiKey: string;
  projectName?: string;
}) {
  const [copied, setCopied] = useState(false);
  // Empty = no data-languages filter: the widget offers every approved language.
  const [selected, setSelected] = useState<string[]>([]);

  const origin = usePublicAppOrigin();
  const snippet = buildEmbedSnippet({ apiKey, languages: selected, defaultLanguage: "en", origin });

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const options = LANG_OPTIONS.map((l) => ({
    code: l.code,
    name: l.name.replace(" (RTL)", ""),
    nativeName: l.native,
    rtl: l.name.includes("(RTL)"),
  }));

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-6 md:p-8 shadow-sm space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Install the language switcher</h2>
          <p className="text-sm text-slate-500 mt-1">
            Paste this into the <code className="px-1 rounded bg-slate-100 text-slate-700 font-mono text-xs">&lt;head&gt;</code> of every page. Leave the language filter empty to offer every language that has approved translations.
          </p>
        </div>
        <span className="self-start text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-medium whitespace-nowrap">
          {projectName}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <span className="text-sm font-medium text-slate-700 whitespace-nowrap">Offer only these languages</span>
        <div className="sm:w-96">
          <LanguageMultiSelect languages={options} value={selected} onChange={setSelected} max={options.length} placeholder="All approved languages" />
        </div>
      </div>

      <div className="relative">
        <pre className="p-4 pr-28 rounded-xl bg-slate-900 text-xs font-mono text-emerald-300 overflow-x-auto whitespace-pre leading-relaxed">
          {snippet}
        </pre>
        <button
          type="button"
          onClick={handleCopy}
          className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-sm transition-colors cursor-pointer"
        >
          {copied ? "Copied!" : "Copy script"}
        </button>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <li className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
          <p className="font-semibold text-slate-800">Floating switcher</p>
          <p className="mt-1 text-xs text-slate-500">A language button appears in the bottom-right corner; position and colour are configurable.</p>
        </li>
        <li className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
          <p className="font-semibold text-slate-800">Approved text only</p>
          <p className="mt-1 text-xs text-slate-500">Visitors only see approved translations, cached for a minute. Unapproved drafts never appear.</p>
        </li>
        <li className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
          <p className="font-semibold text-slate-800">Right-to-left layout</p>
          <p className="mt-1 text-xs text-slate-500">Arabic, Urdu, Hebrew and Persian switch the page to right-to-left automatically.</p>
        </li>
      </ul>
    </section>
  );
}