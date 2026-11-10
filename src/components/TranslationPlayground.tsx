"use client";

import React, { useState } from "react";

export function TranslationPlayground() {
  const [sourceText, setSourceText] = useState(
    "Welcome to our website. We provide fast and reliable web translation."
  );
  const [targetLang, setTargetLang] = useState("es");
  const [translatedText, setTranslatedText] = useState(
    "Bienvenido a nuestro sitio web. Ofrecemos una traducción web rápida y fiable."
  );
  const [isRtl, setIsRtl] = useState(false);
  const [duration, setDuration] = useState<number | null>(12);
  const [provider, setProvider] = useState<string>("WebLingo Open-Source Engine (Auto-Chunking)");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sampleTexts = [
    {
      label: "Short UI Text",
      text: "Welcome to our website. We provide fast and reliable web translation.",
    },
    {
      label: "Long Article (600+ chars)",
      text: "WebLingo is a website translation platform designed to enable localization without paid APIs. In today's digital landscape, website owners often struggle with recurring fees for translation services. WebLingo provides a self-hosted alternative that extracts text from HTML pages and delivers translations seamlessly. Whether dealing with short navigation buttons or long informative paragraphs, the engine handles content without truncating long articles. Right to left languages such as Arabic and Urdu are fully supported with proper layout adjustments.",
    },
    {
      label: "Support Notice",
      text: "Contact our support team for help. Read our privacy policy and terms of service.",
    },
  ];

  const handleTranslate = async (textToTranslate = sourceText, lang = targetLang) => {
    if (!textToTranslate.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/translate/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_lang: "en",
          target_lang: lang,
          texts: [textToTranslate.trim()],
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.translations && data.translations.length > 0) {
        setTranslatedText(data.translations[0].translated);
        setIsRtl(Boolean(data.target_rtl));
        setDuration(data.duration_ms);
        setProvider(data.provider || "WebLingo Open-Source Engine");
      }
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
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <span className="text-emerald-400">⚡</span> Live Translation Engine Playground
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/30">
              Unlimited Length • Auto-Chunking
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Now supporting full webpage articles, long multi-paragraph content, and short UI strings with zero character caps.
          </p>
        </div>

        {/* Target Language Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Target Language:</span>
          <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => {
                setTargetLang("es");
                handleTranslate(sourceText, "es");
              }}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                targetLang === "es"
                  ? "bg-blue-600 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Spanish (es)
            </button>
            <button
              type="button"
              onClick={() => {
                setTargetLang("ar");
                handleTranslate(sourceText, "ar");
              }}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                targetLang === "ar"
                  ? "bg-amber-600 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Arabic (ar) • RTL
            </button>
            <button
              type="button"
              onClick={() => {
                setTargetLang("ur");
                handleTranslate(sourceText, "ur");
              }}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                targetLang === "ur"
                  ? "bg-purple-600 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Urdu (ur) • RTL
            </button>
          </div>
        </div>
      </div>

      {/* Quick Presets */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Quick Test Samples:</span>
        {sampleTexts.map((item, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => {
              setSourceText(item.text);
              handleTranslate(item.text, targetLang);
            }}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>{item.label}</span>
            <span className="text-[10px] text-slate-400 font-mono">({item.text.length} chars)</span>
          </button>
        ))}
      </div>

      {/* Translation Work Area */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Input Box */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-400 flex items-center justify-between">
            <span>Source Text (English)</span>
            <span className="text-slate-400 font-mono text-xs">
              {sourceText.length} characters {sourceText.length > 350 ? `(auto-chunked)` : ""}
            </span>
          </label>
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            rows={7}
            className="w-full rounded-2xl bg-slate-950 border border-slate-800 p-4 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-sans leading-relaxed"
            placeholder="Type or paste any website text of any length..."
          />
        </div>

        {/* Output Box */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-400 flex items-center justify-between">
            <span>
              Translated Output ({targetLang.toUpperCase()})
              {isRtl && (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  RTL Layout Active
                </span>
              )}
            </span>
            {duration !== null && (
              <span className="text-emerald-400 font-mono text-xs">{duration} ms</span>
            )}
          </label>
          <div
            dir={isRtl ? "rtl" : "ltr"}
            className={`min-h-[178px] rounded-2xl bg-slate-950 border border-slate-800 p-4 text-sm transition-all font-sans ${
              isRtl ? "text-right leading-loose text-base font-medium text-amber-100" : "text-left leading-relaxed text-slate-100"
            }`}
          >
            {loading ? (
              <div className="flex items-center gap-2 text-slate-400 not-italic text-sm">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></span>
                Chunking and translating text ({sourceText.length} characters) into {targetLang.toUpperCase()}...
              </div>
            ) : (
              translatedText
            )}
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        <div className="text-xs text-slate-400 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>Provider: {provider}</span>
        </div>

        <button
          type="button"
          onClick={() => handleTranslate()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold text-white shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50 text-sm cursor-pointer"
        >
          {loading ? "Translating..." : "Translate Full Text"}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          Error: {error}
        </div>
      )}
    </section>
  );
}
