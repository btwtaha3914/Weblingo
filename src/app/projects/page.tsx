import React from "react";
import Link from "next/link";
import { db } from "@/db";
import { projects, pages, sourceStrings } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { CreateProjectModal } from "@/components/CreateProjectModal";
import { EditProjectModal } from "@/components/EditProjectModal";
import { ProjectDeleteButton } from "@/components/ProjectDeleteButton";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const allProjects = await db
    .select()
    .from(projects)
    .orderBy(desc(projects.createdAt));

  // Compute page and string counts for each project
  const projectStats = await Promise.all(
    allProjects.map(async (p) => {
      const [pagesCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(pages)
        .where(eq(pages.projectId, p.id));

      const [stringsCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(sourceStrings)
        .where(eq(sourceStrings.projectId, p.id));

      return {
        ...p,
        pagesCount: pagesCount?.count || 0,
        stringsCount: stringsCount?.count || 0,
      };
    })
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Translation Projects
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Manage your websites, configure target languages, and open project workspaces.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <CreateProjectModal />
          </div>
        </div>

        {/* Project Cards List */}
        {projectStats.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center space-y-4 max-w-md mx-auto shadow-xs">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto text-xl">
              📁
            </div>
            <h3 className="text-base font-bold text-slate-900">No Projects Yet</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Create your first project to start extracting and translating website pages.
            </p>
            <div>
              <CreateProjectModal />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {projectStats.map((p) => {
              const langs = (p.targetLanguages as string[]) || ["es", "ar", "ur"];
              return (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-5 hover:border-slate-300 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    {/* Top Row: Name, Status, Actions */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                            {p.name}
                          </h2>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Active
                          </span>
                        </div>
                        <a
                          href={p.baseUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-600 hover:underline font-mono inline-flex items-center gap-1 mt-0.5"
                        >
                          <span>{p.baseUrl}</span>
                          <span className="text-[10px]">↗</span>
                        </a>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <EditProjectModal project={{ id: p.id, name: p.name, baseUrl: p.baseUrl, targetLanguages: langs, isAutoPublish: p.isAutoPublish }} />
                        <ProjectDeleteButton projectId={p.id} projectName={p.name} />
                      </div>
                    </div>

                    {/* Stats Pill */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <span className="text-slate-400 block text-[11px]">Pages Monitored</span>
                        <span className="text-base font-bold text-slate-800">{p.pagesCount}</span>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <span className="text-slate-400 block text-[11px]">Source Strings</span>
                        <span className="text-base font-bold text-slate-800">{p.stringsCount}</span>
                      </div>
                    </div>

                    {/* Target Languages */}
                    <div>
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                        Target Languages
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {langs.map((l) => (
                          <span
                            key={l}
                            className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 font-mono text-xs font-semibold"
                          >
                            {l.toUpperCase()} {["ar", "ur"].includes(l) ? "(RTL)" : ""}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* API Key info */}
                    <div className="text-[11px] font-mono text-slate-400 p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                      <span>API Key:</span>
                      <span className="text-slate-600 font-medium">{p.apiKey.slice(0, 18)}...</span>
                    </div>
                  </div>

                  {/* Open Project CTA */}
                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs text-slate-400">
                      Created {new Date(p.createdAt).toLocaleDateString()}
                    </span>
                    <Link
                      href={`/projects/${p.id}`}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-sm transition-all inline-flex items-center gap-1.5"
                    >
                      <span>Open Workspace</span>
                      <span>→</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
