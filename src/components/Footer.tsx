import React from "react";
import Link from "next/link";
import { Logo } from "./Logo";
import { ResetDbButton } from "./ResetDbButton";

export function Footer() {
  return (
    <footer className="bg-white border-t border-slate-200 text-slate-600 text-xs py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand info */}
          <div className="space-y-3 md:col-span-2">
            <Logo size="md" />
            <p className="text-slate-500 max-w-sm leading-relaxed mt-2">
              WebLingo is a self-hosted, open-source website translation platform that translates websites into multiple languages—including Arabic and Urdu with native RTL layouts—without paid translation APIs.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 font-medium text-[11px] border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                100% Free & Open-Source
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 font-medium text-[11px] border border-blue-200">
                Zero Paid API Subscriptions
              </span>
            </div>
          </div>

          {/* Platform Links */}
          <div className="space-y-2">
            <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Platform</h4>
            <ul className="space-y-1.5 text-slate-600">
              <li>
                <Link href="/#translator" className="hover:text-blue-600 transition-colors">
                  Webpage Translator Tool
                </Link>
              </li>
              <li>
                <Link href="/projects" className="hover:text-blue-600 transition-colors">
                  My Projects
                </Link>
              </li>
              <li>
                <Link href="/client-demo" className="hover:text-blue-600 transition-colors">
                  Live Client Demo Website
                </Link>
              </li>
              <li>
                <Link href="/#faq" className="hover:text-blue-600 transition-colors">
                  User Guide & FAQ
                </Link>
              </li>
            </ul>
          </div>

          {/* Supported Languages & Dev Tools */}
          <div className="space-y-2">
            <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Developer & Testing</h4>
            <ul className="space-y-1.5 text-slate-600">
              <li>
                <Link href="/api/health" target="_blank" className="hover:text-blue-600 transition-colors">
                  System Healthcheck API
                </Link>
              </li>
              <li>
                <Link href="/widget.js" target="_blank" className="hover:text-blue-600 transition-colors">
                  View Embed Script (widget.js)
                </Link>
              </li>
              <li className="pt-2">
                <span className="text-[11px] text-slate-400 block mb-1">Testing reset tool:</span>
                <ResetDbButton />
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-slate-400">
          <p>© 2026 WebLingo Translation Platform. Designed for open-source self-hosted localization.</p>
          <div className="flex items-center gap-4 text-slate-500">
            <span>English (Source)</span>
            <span>•</span>
            <span>Español</span>
            <span>•</span>
            <span>العربية (RTL)</span>
            <span>•</span>
            <span>اردو (RTL)</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
