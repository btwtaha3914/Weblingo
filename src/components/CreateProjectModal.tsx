"use client";

import React, { useState } from "react";

export function CreateProjectModal({ onProjectCreated }: { onProjectCreated?: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://");
  const [selectedLangs, setSelectedLangs] = useState<string[]>(["es", "ar", "ur"]);
  const [domains, setDomains] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableLanguages = [
    { code: "es", label: "Spanish" },
    { code: "ar", label: "Arabic (RTL)" },
    { code: "ur", label: "Urdu (RTL)" },
    { code: "fr", label: "French" },
    { code: "de", label: "German" },
    { code: "it", label: "Italian" },
  ];

  const toggleLanguage = (code: string) => {
    if (selectedLangs.includes(code)) {
      if (selectedLangs.length > 1) {
        setSelectedLangs(selectedLangs.filter((l) => l !== code));
      }
    } else {
      setSelectedLangs([...selectedLangs, code]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !baseUrl.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const allowedDomainsList = domains
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          baseUrl: baseUrl.trim(),
          targetLanguages: selectedLangs,
          allowedDomains: allowedDomainsList,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create project");

      setIsOpen(false);
      setName("");
      setBaseUrl("https://");
      setDomains("");
      if (onProjectCreated) onProjectCreated();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-sm transition-all cursor-pointer whitespace-nowrap"
      >
        + Add Website Project
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Add New Website Project</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure website domain and default target languages
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

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-700 font-semibold block mb-1">Website Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. My Online Store"
                  className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3.5 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="text-slate-700 font-semibold block mb-1">Website URL</label>
                <input
                  type="url"
                  required
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3.5 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-600 font-mono"
                />
              </div>

              <div>
                <label className="text-slate-700 font-semibold block mb-1.5">Target Languages</label>
                <div className="grid grid-cols-3 gap-2">
                  {availableLanguages.map((lang) => {
                    const isSelected = selectedLangs.includes(lang.code);
                    return (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => toggleLanguage(lang.code)}
                        className={`px-3 py-2 rounded-lg text-left text-xs border transition-all cursor-pointer ${
                          isSelected
                            ? "bg-blue-50 border-blue-500 text-blue-700 font-semibold shadow-xs"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {isSelected ? "✓ " : "+ "}
                        {lang.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-slate-700 font-semibold block mb-1">
                  Allowed Domains (Optional, comma-separated)
                </label>
                <input
                  type="text"
                  value={domains}
                  onChange={(e) => setDomains(e.target.value)}
                  placeholder="example.com, staging.example.com"
                  className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3.5 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-600 font-mono"
                />
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {loading ? "Creating..." : "Save Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
