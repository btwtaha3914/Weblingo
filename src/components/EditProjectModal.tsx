"use client";

import React, { useState } from "react";

interface ProjectData {
  id: number;
  name: string;
  baseUrl: string;
  targetLanguages: string[];
  allowedDomains?: string[];
  isAutoPublish?: boolean;
}

const AVAILABLE_LANGUAGES = [
  { code: "es", label: "Spanish" },
  { code: "ar", label: "Arabic (RTL)" },
  { code: "ur", label: "Urdu (RTL)" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
];

export function EditProjectModal({
  project,
  onUpdated,
}: {
  project: ProjectData;
  onUpdated?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [baseUrl, setBaseUrl] = useState(project.baseUrl);
  const [allowedDomains, setAllowedDomains] = useState((project.allowedDomains || []).join(", "));
  const [selectedLangs, setSelectedLangs] = useState<string[]>(
    Array.isArray(project.targetLanguages) ? project.targetLanguages : ["es", "ar", "ur"]
  );
  const [isAutoPublish, setIsAutoPublish] = useState<boolean>(
    project.isAutoPublish !== undefined ? Boolean(project.isAutoPublish) : true
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleLanguage = (code: string) => {
    if (selectedLangs.includes(code)) {
      if (selectedLangs.length > 1) {
        setSelectedLangs(selectedLangs.filter((l) => l !== code));
      }
    } else {
      setSelectedLangs([...selectedLangs, code]);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !baseUrl.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          baseUrl: baseUrl.trim(),
          targetLanguages: selectedLangs,
          isAutoPublish,
          allowedDomains: allowedDomains.split(",").map((domain) => domain.trim()).filter(Boolean),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update project");

      setIsOpen(false);
      if (onUpdated) onUpdated();
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
        className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-xs transition-colors cursor-pointer"
      >
        Edit Project
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Edit Project Settings</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Update website information, languages, and auto-approval preferences
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

            <form onSubmit={handleUpdate} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-700 font-semibold block mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3.5 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="text-slate-700 font-semibold block mb-1">Base Website URL</label>
                <input
                  type="url"
                  required
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3.5 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-600 font-mono"
                />
              </div>

              <div>
                <label className="text-slate-700 font-semibold block mb-1">Allowed Widget Domains</label>
                <input
                  type="text"
                  value={allowedDomains}
                  onChange={(e) => setAllowedDomains(e.target.value)}
                  placeholder="example.com, staging.example.com"
                  className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3.5 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-600 font-mono"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Only add sites where you intend to install this project&apos;s widget. Enter hostnames only, comma-separated.
                </p>
              </div>

              <div>
                <label className="text-slate-700 font-semibold block mb-1.5">Enabled Target Languages</label>
                <div className="grid grid-cols-3 gap-2">
                  {AVAILABLE_LANGUAGES.map((lang) => {
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

              <div className="pt-2 flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="font-semibold text-slate-800 block text-xs">Auto-Approval Mode</span>
                  <span className="text-[11px] text-slate-500">
                    Automatically publish new translations to the visitor widget
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={isAutoPublish}
                  onChange={(e) => setIsAutoPublish(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
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
                  {loading ? "Saving Changes..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
