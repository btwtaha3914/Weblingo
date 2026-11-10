import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { projects, pages, sourceStrings, translations, projectDomains } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { QuickTranslateBar } from "@/components/QuickTranslateBar";
import { TranslationEditor } from "@/components/TranslationEditor";
import { EditProjectModal } from "@/components/EditProjectModal";
import { ProjectDeleteButton } from "@/components/ProjectDeleteButton";
import { WidgetSnippetCard } from "@/components/WidgetSnippetCard";

export const dynamic = "force-dynamic";

export default async function ProjectWorkspacePage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const projectId = Number(params.id);

  if (!projectId || isNaN(projectId)) {
    notFound();
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!project) {
    notFound();
  }

  // Fetch project pages
  const projectPages = await db
    .select()
    .from(pages)
    .where(eq(pages.projectId, projectId))
    .orderBy(desc(pages.createdAt));

  // Compute stats
  const [stringsCountRes] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sourceStrings)
    .where(eq(sourceStrings.projectId, projectId));

  const [approvedCountRes] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(translations)
    .innerJoin(sourceStrings, eq(translations.stringId, sourceStrings.id))
    .where(eq(sourceStrings.projectId, projectId));

  const domains = await db
    .select()
    .from(projectDomains)
    .where(eq(projectDomains.projectId, projectId));

  const totalStrings = stringsCountRes?.count || 0;
  const totalApproved = approvedCountRes?.count || 0;
  const langs = (project.targetLanguages as string[]) || ["es", "ar", "ur"];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Workspace Breadcrumb & Header */}
        <div className="space-y-4 border-b border-slate-200/80 pb-6">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <Link href="/projects" className="hover:text-blue-600">
              Projects
            </Link>
            <span>/</span>
            <span className="text-slate-800 font-semibold">{project.name}</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {project.name}
                </h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                  Active
                </span>
              </div>
              <a
                href={project.baseUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 hover:underline font-mono inline-flex items-center gap-1"
              >
                <span>{project.baseUrl}</span>
                <span className="text-[10px]">↗</span>
              </a>
            </div>

            <div className="flex items-center gap-2.5">
              <EditProjectModal
                project={{
                  id: project.id,
                  name: project.name,
                  baseUrl: project.baseUrl,
                  targetLanguages: langs,
                  allowedDomains: domains.map((domain) => domain.domain),
                  isAutoPublish: project.isAutoPublish,
                }}
              />
              <ProjectDeleteButton projectId={project.id} projectName={project.name} />
            </div>
          </div>

          {/* Target Languages Chips */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="text-xs font-semibold text-slate-500">Configured Languages:</span>
            {langs.map((l) => (
              <span
                key={l}
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 text-xs font-mono font-semibold shadow-xs"
              >
                {l.toUpperCase()} {["ar", "ur"].includes(l) ? "(RTL)" : ""}
              </span>
            ))}
          </div>
        </div>

        {/* Workspace Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
            <span className="text-slate-500 text-xs font-medium">Monitored Pages</span>
            <p className="text-2xl font-bold text-slate-900 mt-1">{projectPages.length}</p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
            <span className="text-slate-500 text-xs font-medium">Extracted Strings</span>
            <p className="text-2xl font-bold text-slate-900 mt-1">{totalStrings}</p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
            <span className="text-slate-500 text-xs font-medium">Approved Translations</span>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{totalApproved}</p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
            <span className="text-slate-500 text-xs font-medium">Auto-Publish</span>
            <p className="text-2xl font-bold text-blue-600 mt-1">
              {project.isAutoPublish ? "Enabled" : "Manual"}
            </p>
          </div>
        </div>

        {/* Quick Webpage Translate Bar within this project */}
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900">Add & Translate Webpage</h2>
          <QuickTranslateBar projectId={project.id} apiKey={project.apiKey} />
        </div>

        {/* Monitored Pages List */}
        {projectPages.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Project Pages ({projectPages.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase text-[10px]">
                    <th className="py-2.5 px-3">Page Title</th>
                    <th className="py-2.5 px-3">URL Path</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Strings</th>
                    <th className="py-2.5 px-3 text-right">Extracted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {projectPages.map((page) => (
                    <tr key={page.id} className="hover:bg-slate-50/60">
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{page.title}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">{page.urlPath}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700">
                          {page.translationStatus}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-700">{page.stringCount}</td>
                      <td className="py-2.5 px-3 text-right text-slate-400">
                        {page.lastExtractedAt ? new Date(page.lastExtractedAt).toLocaleDateString() : "Just now"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Translation Strings Library with Editable Rows */}
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Translation Library & String Editor</h2>
            <p className="text-xs text-slate-500">
              All extracted strings are auto-approved. Click &quot;Edit&quot; on any line to modify or customize phrasing.
            </p>
          </div>
          <TranslationEditor projectId={project.id} />
        </div>

        {/* Embed Widget Snippet */}
        <WidgetSnippetCard apiKey={project.apiKey} projectName={project.name} />
      </main>

      <Footer />
    </div>
  );
}
