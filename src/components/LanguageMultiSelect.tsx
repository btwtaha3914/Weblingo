"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
  rtl: boolean;
}

const POPULAR = ["es", "fr", "de", "ar", "ur", "zh"];

/** Accessible multi-select for target languages (search, checkboxes, chips). */
export function LanguageMultiSelect({
  languages,
  value,
  onChange,
  disabled,
  max = 10,
  placeholder = "Choose languages…",
}: {
  languages: LanguageOption[];
  value: string[];
  onChange: (codes: string[]) => void;
  disabled?: boolean;
  max?: number;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return languages;
    return languages.filter(
      (l) => l.name.toLowerCase().includes(q) || l.nativeName.toLowerCase().includes(q) || l.code.includes(q)
    );
  }, [languages, query]);

  const toggle = (code: string) => {
    if (value.includes(code)) onChange(value.filter((c) => c !== code));
    else if (value.length < max) onChange([...value, code]);
  };
  const byCode = (code: string) => languages.find((l) => l.code === code);
  const popular = POPULAR.filter((c) => byCode(c));

  return (
    <div ref={rootRef} className="relative min-w-[260px]">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full min-h-[46px] flex items-center gap-1.5 flex-wrap bg-slate-50 border border-slate-300 rounded-xl pl-3 pr-9 py-2 text-left text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 disabled:opacity-60 cursor-pointer relative"
      >
        {value.length === 0 ? (
          <span className="text-slate-400">{placeholder}</span>
        ) : (
          <>
            {value.slice(0, 3).map((code) => (
              <span key={code} className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 text-xs font-semibold max-w-[9rem] truncate">
                {byCode(code)?.name || code}
              </span>
            ))}
            {value.length > 3 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 text-xs font-semibold" title={value.map((c) => byCode(c)?.name || c).join(", ")}>
                +{value.length - 3} more
              </span>
            )}
          </>
        )}
        <svg className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
        <span className="sr-only">{value.length} {value.length === 1 ? "language" : "languages"} selected</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-full min-w-[300px] right-0 bg-white border border-slate-200 rounded-xl shadow-xl p-2">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search languages"
            aria-label="Search languages"
            className="w-full px-3 py-2 mb-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <div className="flex flex-wrap items-center gap-1.5 px-1 pb-2 border-b border-slate-100 text-xs">
            <button type="button" onClick={() => onChange(popular.slice(0, max))} className="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer">
              Popular ({popular.length})
            </button>
            <button type="button" onClick={() => onChange([])} className="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer">
              Clear
            </button>
            <span className="ml-auto text-slate-500">
              {value.length}/{max} selected
            </span>
          </div>
          <ul role="listbox" aria-multiselectable="true" className="max-h-64 overflow-y-auto py-1">
            {filtered.map((l) => {
              const checked = value.includes(l.code);
              const atLimit = !checked && value.length >= max;
              return (
                <li key={l.code} role="option" aria-selected={checked}>
                  <label className={`flex items-center gap-3 px-2 py-1.5 rounded-lg text-sm ${atLimit ? "opacity-40" : "hover:bg-slate-50 cursor-pointer"}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={atLimit}
                      onChange={() => toggle(l.code)}
                      aria-label={`${l.name} (${l.nativeName})`}
                      className="accent-blue-600 w-4 h-4"
                    />
                    <span className="w-9 text-[11px] font-mono font-bold uppercase text-slate-500">{l.code}</span>
                    <span className="flex-1 text-slate-800">{l.name}</span>
                    <span className="text-slate-500" dir={l.rtl ? "rtl" : "ltr"}>{l.nativeName}</span>
                  </label>
                </li>
              );
            })}
            {filtered.length === 0 && <li className="px-2 py-3 text-sm text-slate-500">No language matches “{query}”.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
