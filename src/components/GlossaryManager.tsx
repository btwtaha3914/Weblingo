"use client";

import React, { useState, useEffect } from "react";

interface GlossaryItem {
  id: number;
  sourceTerm: string;
  targetTerm: string;
  targetLanguage: string;
  notes: string | null;
}

export function GlossaryManager({ projectId = 1 }: { projectId?: number }) {
  const [entries, setEntries] = useState<GlossaryItem[]>([]);
  const [sourceTerm, setSourceTerm] = useState("");
  const [targetTerm, setTargetTerm] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("ar");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetch(`/api/glossary?projectId=${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (active && data.ok) setEntries(data.entries || []);
      })
      .catch((err) => console.error("Glossary fetch error:", err));

    return () => {
      active = false;
    };
  }, [projectId]);

  const loadGlossary = async () => {
    try {
      const res = await fetch(`/api/glossary?projectId=${projectId}`);
      const data = await res.json();
      if (data.ok) {
        setEntries(data.entries || []);
      }
    } catch (err) {
      console.error("Glossary fetch error:", err);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceTerm.trim() || !targetTerm.trim()) return;
    setLoading(true);
    setStatusMsg(null);

    try {
      const res = await fetch("/api/glossary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          sourceTerm: sourceTerm.trim(),
          targetTerm: targetTerm.trim(),
          targetLanguage,
          notes: notes.trim(),
        }),
      });

      if (res.ok) {
        setStatusMsg("Glossary rule saved successfully!");
        setSourceTerm("");
        setTargetTerm("");
        setNotes("");
        loadGlossary();
        setTimeout(() => setStatusMsg(null), 3000);
      }
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`/api/glossary?id=${id}`, { method: "DELETE" });
      loadGlossary();
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <span className="text-amber-400">📖</span> Translation Glossary & Terminology Rules
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Enforce custom translations for brand names, slogans, and industry terms (or keep them untranslated).
          </p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded bg-slate-800 text-slate-300 font-mono">
          {entries.length} Rules Defined
        </span>
      </div>

      {statusMsg && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
          <span>✓</span>
          <span>{statusMsg}</span>
        </div>
      )}

      {/* Add New Rule Form */}
      <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <label className="text-slate-400 font-semibold mb-1 block">Source English Term</label>
          <input
            type="text"
            required
            value={sourceTerm}
            onChange={(e) => setSourceTerm(e.target.value)}
            placeholder="e.g. Apex Global"
            className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="text-slate-400 font-semibold mb-1 block">Mandatory Translation</label>
          <input
            type="text"
            required
            value={targetTerm}
            onChange={(e) => setTargetTerm(e.target.value)}
            placeholder="e.g. آبيكس جلوبال"
            className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="text-slate-400 font-semibold mb-1 block">Target Language</label>
          <select
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
          >
            <option value="ar">Arabic (ar) • RTL</option>
            <option value="ur">Urdu (ur) • RTL</option>
            <option value="es">Spanish (es)</option>
            <option value="fr">French (fr)</option>
            <option value="de">German (de)</option>
          </select>
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 cursor-pointer"
          >
            {loading ? "Adding..." : "+ Add Term Rule"}
          </button>
        </div>
      </form>

      {/* Existing Rules Table */}
      {entries.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/70">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400 font-semibold text-[10px] uppercase">
                <th className="py-2.5 px-4">Source Term</th>
                <th className="py-2.5 px-4">Mandatory Translation</th>
                <th className="py-2.5 px-4">Language</th>
                <th className="py-2.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-900/40">
                  <td className="py-2.5 px-4 font-semibold text-slate-200">{entry.sourceTerm}</td>
                  <td className="py-2.5 px-4 text-slate-300 font-medium">{entry.targetTerm}</td>
                  <td className="py-2.5 px-4">
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-[10px] uppercase">
                      {entry.targetLanguage}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(entry.id)}
                      className="text-rose-400 hover:text-rose-300 font-medium text-[11px]"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-6 text-center text-xs text-slate-500">
          No glossary rules yet. Add brand names or terms above to preserve exact translation rules.
        </div>
      )}
    </section>
  );
}
