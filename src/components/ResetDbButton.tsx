"use client";

import React, { useState } from "react";

export function ResetDbButton() {
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!confirm("Are you sure you want to empty all extracted pages, strings, and translations from the database?")) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/reset-database", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || "Database is now empty and clean.");
        window.location.reload();
      } else {
        alert("Error: " + (data.error || "Failed to clear database"));
      }
    } catch (err) {
      alert("Failed to reset database: " + String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleReset}
      disabled={loading}
      className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-700 text-xs font-semibold rounded-xl border border-slate-200 transition-all cursor-pointer disabled:opacity-50"
      title="Clear all extracted pages, strings, and translations from database"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
      <span>{loading ? "Emptying..." : "Empty DB"}</span>
    </button>
  );
}
