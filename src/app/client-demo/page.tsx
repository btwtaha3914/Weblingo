import React from "react";
import Script from "next/script";
import Link from "next/link";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ClientDemoPage() {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, 1),
  });

  const apiKey = project ? project.apiKey : "wl_live_demo_key_77889900aabbccdd";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Banner */}
      <div className="bg-slate-900 text-white px-6 py-3 text-xs sm:text-sm font-medium flex flex-wrap items-center justify-between gap-3 shadow-sm z-50">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>
            <strong>Simulated Website with WebLingo:</strong> Click the floating language switcher at the bottom-right corner to translate this entire site.
          </span>
        </div>
        <Link
          href="/"
          className="px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur transition-all"
        >
          ← Return to Dashboard
        </Link>
      </div>

      {/* Corporate Header */}
      <header className="border-b border-slate-200/80 bg-white sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white shadow-sm">
              A
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">Apex Global Technology</span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a href="#services" className="hover:text-slate-900 transition-colors">
              Services
            </a>
            <a href="#about" className="hover:text-slate-900 transition-colors">
              About Us
            </a>
            <a href="#pricing" className="hover:text-slate-900 transition-colors">
              Pricing
            </a>
            <a href="#contact" className="hover:text-slate-900 transition-colors">
              Contact Us
            </a>
          </nav>

          <button className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all">
            Translate Website
          </button>
        </div>
      </header>

      {/* Main Content Sections to be Translated in Real-Time */}
      <main className="flex-1 max-w-6xl mx-auto px-6 py-12 space-y-16">
        {/* Hero Section */}
        <section className="text-center max-w-3xl mx-auto space-y-6 pt-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            Enterprise Cloud & Localization
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Welcome to our website. We provide fast and reliable web translation.
          </h1>
          <p className="text-lg text-slate-600 leading-relaxed">
            Our mission is to break language barriers across the global web. We deliver autonomous localization for ambitious digital products worldwide.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <button className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-sm transition-all">
              Contact our support team for help.
            </button>
            <button className="px-6 py-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm border border-slate-300 transition-all shadow-xs">
              Save Changes
            </button>
          </div>
        </section>

        {/* Feature Cards Grid */}
        <section id="services" className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-slate-900">Cloud Infrastructure and Localization Solutions</h2>
            <p className="text-sm text-slate-500">Everything you need to deliver localized user experiences.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-3 shadow-xs">
              <div className="text-3xl">🚀</div>
              <h3 className="text-lg font-bold text-slate-900">Autonomous Translation</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Translate your website in minutes without paid APIs. High performance, zero recurring per-character fees.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-3 shadow-xs">
              <div className="text-3xl">🌐</div>
              <h3 className="text-lg font-bold text-slate-900">Full RTL Script Support</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Native right-to-left layout alignment for Arabic and Urdu with automatic typography adjustments.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-3 shadow-xs">
              <div className="text-3xl">🛡️</div>
              <h3 className="text-lg font-bold text-slate-900">Review & Human Approval</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Approve translation drafts before they reach public visitors. Total editorial control.
              </p>
            </div>
          </div>
        </section>

        {/* Call to Action Banner */}
        <section id="contact" className="rounded-2xl bg-blue-600 text-white p-8 md:p-10 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
          <div className="space-y-1.5 text-center md:text-left">
            <h2 className="text-2xl font-bold">Get in touch with our engineers today.</h2>
            <p className="text-sm text-blue-100">
              Read our privacy policy and terms of service before getting started.
            </p>
          </div>
          <button className="px-6 py-3 rounded-xl bg-white text-blue-700 hover:bg-blue-50 font-semibold text-sm shadow-sm transition-all whitespace-nowrap">
            Contact Us
          </button>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 Apex Global Technology. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <a href="#privacy" className="hover:text-slate-800">
              Read our privacy policy and terms of service.
            </a>
          </div>
        </div>
      </footer>

      {/* Injected WebLingo Embeddable Translation Widget Script */}
      <Script
        src="/widget.js"
        data-project-key={apiKey}
        strategy="afterInteractive"
      />
    </div>
  );
}
