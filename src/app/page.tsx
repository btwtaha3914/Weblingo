import React from "react";
import Link from "next/link";
import { db } from "@/db";
import { getDashboardOverview, getProjectList } from "@/lib/db-queries";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { QuickTranslateBar } from "@/components/QuickTranslateBar";
import { TranslationEditor } from "@/components/TranslationEditor";
import { FaqSection } from "@/components/FaqSection";
import { WidgetEmbedModal } from "@/components/WidgetEmbedModal";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [overview, projectsList] = await Promise.all([
    getDashboardOverview(),
    getProjectList(),
  ]);

  const activeProject = projectsList[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col antialiased">
      <Navbar />

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-white via-slate-50 to-slate-100 border-b border-slate-200/80 pt-12 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              <span>🚀</span>
              <span>Zero-Paid-API Website Localization Platform</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.12]">
              Translate Your Entire Website into Multiple Languages
            </h1>

            <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto">
              Extract, translate, and deliver multilingual website experiences with native RTL support for Arabic and Urdu. Add a single 1-line script tag to your header and let visitors switch languages in real-time.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <a
                href="#translator"
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-sm rounded-xl shadow-md shadow-blue-500/25 transition-all inline-flex items-center gap-2 cursor-pointer"
              >
                <span>Translate a Webpage Now</span>
                <span>↓</span>
              </a>

              <Link
                href="/projects"
                className="px-6 py-3 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 font-semibold text-sm rounded-xl border border-slate-300 shadow-xs transition-all inline-flex items-center gap-2"
              >
                <span>Manage Projects</span>
                <span>→</span>
              </Link>
            </div>

            {/* Language badges */}
            <div className="pt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-slate-600">Built-in Support:</span>
              <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 font-medium text-slate-700">🇪🇸 Spanish</span>
              <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 font-medium text-slate-700">🇸🇦 Arabic (RTL)</span>
              <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 font-medium text-slate-700">🇵🇰 Urdu (RTL)</span>
              <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 font-medium text-slate-700">🇫🇷 French</span>
              <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 font-medium text-slate-700">🇩🇪 German</span>
              <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 font-medium text-slate-700">🇮🇹 Italian</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
        {/* Core Tool: Quick Webpage Translator */}
        <div id="translator" className="scroll-mt-20">
          <QuickTranslateBar
            projectId={activeProject ? activeProject.id : 1}
            apiKey={activeProject?.apiKey || "wl_live_demo_key_77889900aabbccdd"}
          />
        </div>

        {/* Dashboard Overview Cards */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">Platform Overview</h3>
            <Link
              href="/projects"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <span>View All Projects</span>
              <span>→</span>
            </Link>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Projects</span>
                <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600 font-mono">Total</span>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2">{overview.totalProjects}</p>
              <p className="text-xs text-slate-400 mt-0.5">Configured websites</p>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Translated Pages</span>
                <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 font-mono">Pages</span>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2">{overview.totalPages}</p>
              <p className="text-xs text-slate-400 mt-0.5">Processed URLs</p>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Source Strings</span>
                <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600 font-mono">SHA-256</span>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2">{overview.totalStrings}</p>
              <p className="text-xs text-slate-400 mt-0.5">Deduplicated phrases</p>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Approved Strings</span>
                <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 font-mono">Live</span>
              </div>
              <p className="text-2xl font-bold text-emerald-600 mt-2">{overview.approvedTranslations}</p>
              <p className="text-xs text-slate-400 mt-0.5">Live on widget</p>
            </div>
          </div>
        </section>

        {/* Translation Strings Library with Editable Rows */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Translation Library & String Editor</h3>
              <p className="text-xs text-slate-500">
                All translated lines are automatically approved for the widget. You have full authority to click &quot;Edit&quot; on any line to adjust the text.
              </p>
            </div>
          </div>

          <TranslationEditor projectId={activeProject ? activeProject.id : 1} />
        </section>

        {/* How It Works Section */}
        <section id="how-it-works" className="bg-white rounded-3xl border border-slate-200/80 p-8 sm:p-10 shadow-xs space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">How WebLingo Works</h2>
            <p className="text-sm text-slate-500">
              Three simple steps to translate your website and give your global visitors a local experience.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                1
              </div>
              <h3 className="text-base font-bold text-slate-900">Enter Webpage URL</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Enter your website URL and choose your target language. WebLingo safely fetches your page and identifies headings, paragraphs, and buttons.
              </p>
            </div>

            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                2
              </div>
              <h3 className="text-base font-bold text-slate-900">Auto-Translate & Approve</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                The open-source engine translates every string and automatically approves it. You can edit and customize any phrasing anytime from the dashboard.
              </p>
            </div>

            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                3
              </div>
              <h3 className="text-base font-bold text-slate-900">Embed 1-Line Script</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Paste the generated script snippet into your site header. Visitors get a floating language switcher with real-time translation and RTL support.
              </p>
            </div>
          </div>
        </section>

        {/* Live Client Demonstration Banner */}
        <section className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-3xl p-8 sm:p-10 flex flex-col md:flex-row items-center justify-between gap-6 shadow-md">
          <div className="space-y-2 text-center md:text-left">
            <span className="text-xs uppercase tracking-wider font-bold text-blue-200">Interactive Verification</span>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Test the Widget on a Live Simulated Website</h2>
            <p className="text-sm text-blue-100 max-w-xl">
              See the floating language selector switch languages and flip layout to RTL in real-time on our simulated corporate website.
            </p>
          </div>
          <Link
            href="/client-demo"
            className="px-6 py-3.5 bg-white hover:bg-slate-100 text-blue-700 font-bold text-sm rounded-xl shadow-lg transition-all whitespace-nowrap"
          >
            Open Live Demo Website ↗
          </Link>
        </section>

        {/* Frequently Asked Questions */}
        <FaqSection />
      </main>

      <Footer />
    </div>
  );
}
