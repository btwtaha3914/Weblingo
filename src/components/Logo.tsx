import React from "react";
import Link from "next/link";

export function Logo({
  variant = "dark",
  size = "md",
  href = "/",
}: {
  variant?: "dark" | "light";
  size?: "sm" | "md" | "lg";
  href?: string;
}) {
  const iconSizes = {
    sm: "w-7 h-7 text-xs",
    md: "w-9 h-9 text-sm",
    lg: "w-11 h-11 text-base",
  };

  const textSizes = {
    sm: "text-base",
    md: "text-lg",
    lg: "text-2xl",
  };

  const textColor = variant === "light" ? "text-white" : "text-slate-900";
  const subColor = variant === "light" ? "text-slate-400" : "text-slate-500";

  return (
    <Link href={href} className="inline-flex items-center gap-2.5 group select-none">
      <div
        className={`${iconSizes[size]} rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 flex items-center justify-center font-bold text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform duration-200`}
      >
        <svg
          className="w-5 h-5 text-white"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a15.3 15.3 0 0 1 4 9 15.3 15.3 0 0 1-4 9 15.3 15.3 0 0 1-4-9 15.3 15.3 0 0 1 4-9z" />
          <path d="M3.6 9h16.8" />
          <path d="M3.6 15h16.8" />
        </svg>
      </div>
      <div className="flex flex-col leading-none">
        <div className="flex items-center gap-1.5">
          <span className={`font-extrabold ${textSizes[size]} tracking-tight ${textColor}`}>
            WebLingo
          </span>
          <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
            AI
          </span>
        </div>
        <span className={`text-[10px] font-medium ${subColor} tracking-normal`}>
          Website Translation Platform
        </span>
      </div>
    </Link>
  );
}
