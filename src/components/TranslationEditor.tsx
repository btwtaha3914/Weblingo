"use client";

import React, { useState, useEffect } from "react";

interface StringTranslationRow {
  stringId: number;
  contentHash: string;
  sourceText: string;
  contextHint: string;
  wordCount: number;
  translationId: number | null;
  targetLanguage: string | null;
  translatedText: string | null;
  status: string | null;
  isReviewed: boolean | null;
}

export function TranslationEditor({ projectId = 1 }: { projectId?: number }) {
  const [targetLang, setTargetLang] = useState("es");
  const [rows, setRows] = useState<StringTranslationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [notification, setNotification] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/translations?projectId=${projectId}&targetLang=${targetLang}`, {
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) setRows(data.strings || []);
      })
      .catch((err) => {
        if (err instanceof Error && err.name !== "AbortError") {
          console.error("Failed to load translations:", err);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [projectId, targetLang]);

  const fetchTranslations = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/translations?projectId=${projectId}&targetLang=${targetLang}`);
      const data = await res.json();
      if (data.ok) {
        setRows(data.strings || []);
      }
    } catch (err) {
      console.error("Failed to load translations:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTranslation = async (stringId: number, approve = false) => {
    try {
      const res = await fetch("/api/translations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: approve ? "approve" : "update",
          stringId,
          targetLanguage: targetLang,
          translatedText: editText,
          projectId,
        }),
      });

      if (res.ok) {
        setNotification(approve ? "Translation updated and approved!" : "Saved.");
        setTimeout(() => setNotification(null), 3000);
        setEditingId(null);
        fetchTranslations();
      }
    } catch (err) {
      console.error("Save error:", err);
    }
  };

  const handleTranslateAll = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/translations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "translate_all",
          projectId,
          targetLanguage: targetLang,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setNotification(`Translated ${data.count} strings into ${targetLang.toUpperCase()} (${data.duration_ms}ms)`);
        setTimeout(() => setNotification(null), 4000);
        fetchTranslations();
      }
    } catch (err) {
      console.error("Auto translate error:", err);
    } finally {
      setLoading(false);
    }
  };

  const isRtl = ["ar", "ur"].includes(targetLang);

  const filteredRows = rows.filter(r =>
    r.sourceText.toLowerCase().includes(filter.toLowerCase()) ||
    (r.translatedText && r.translatedText.toLowerCase().includes(filter.toLowerCase()))
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-5">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        {/* Language Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
          {[
            { code: "es", name: "Spanish" },
            { code: "ar", name: "Arabic (RTL)" },
            { code: "ur", name: "Urdu (RTL)" },
            { code: "fr", name: "French" },
            { code: "de", name: "German" },
          ].map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setTargetLang(l.code)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                targetLang === l.code
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {l.name}
            </button>
          ))}
        </div>

        {/* Search & Batch Translate */}
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search strings..."
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button
            type="button"
            onClick={handleTranslateAll}
            disabled={loading}
            className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs rounded-lg transition-colors border border-blue-200 cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            Translate All to {targetLang.toUpperCase()}
          </button>
        </div>
      </div>

      {notification && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
          <span>✓</span>
          <span>{notification}</span>
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-500">Loading translation strings...</div>
      ) : filteredRows.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-500">
          No strings found. Enter a URL above and click &quot;Translate Webpage&quot; to populate your library.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-2.5 px-3 w-5/12">Source Text (English)</th>
                <th className="py-2.5 px-3 w-5/12">Translation ({targetLang.toUpperCase()})</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.slice(0, 50).map((row) => (
                <tr key={row.stringId} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 px-3 align-top leading-relaxed text-slate-800">
                    <p className="font-medium">{row.sourceText}</p>
                    {row.contextHint && (
                      <span className="inline-block mt-0.5 text-[10px] font-mono text-slate-400 uppercase">
                        {row.contextHint}
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-3 align-top leading-relaxed">
                    {editingId === row.stringId ? (
                      <div className="space-y-2">
                        <textarea
                          dir={isRtl ? "rtl" : "ltr"}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={2}
                          className={`w-full rounded-lg bg-slate-50 border border-blue-500 p-2 text-xs text-slate-900 focus:outline-none ${
                            isRtl ? "text-right font-medium" : ""
                          }`}
                        />
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSaveTranslation(row.stringId, true)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-semibold cursor-pointer"
                          >
                            Save & Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-2 py-1 text-slate-500 hover:text-slate-800 text-[11px] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        dir={isRtl ? "rtl" : "ltr"}
                        className={`text-slate-900 ${
                          isRtl ? "text-right font-medium text-sm" : ""
                        }`}
                      >
                        {row.translatedText || (
                          <span className="text-slate-400 italic">Not translated</span>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="py-3 px-3 align-top whitespace-nowrap">
                    {row.status === "approved" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        Approved
                      </span>
                    ) : row.status === "draft" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        Draft
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[10px]">Pending</span>
                    )}
                  </td>

                  <td className="py-3 px-3 align-top text-right whitespace-nowrap">
                    {editingId !== row.stringId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(row.stringId);
                          setEditText(row.translatedText || row.sourceText);
                        }}
                        className="text-blue-600 hover:text-blue-800 font-semibold text-[11px] cursor-pointer"
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
