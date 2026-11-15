import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, sourceStrings, translations } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { isWidgetOriginAllowed, withWidgetCors } from "@/lib/access";
import { languageInfo } from "@/lib/languages";

export const dynamic = "force-dynamic";

/** Public widget bootstrap: which languages this project can show. */
export async function GET(request: Request) {
  try {
    const key = new URL(request.url).searchParams.get("key") || "";
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) {
      return withWidgetCors(NextResponse.json({ error: "Missing or invalid project key." }, { status: 400 }));
    }
    const project = await db.query.projects.findFirst({ where: eq(projects.apiKey, key) });
    if (!project) {
      return withWidgetCors(NextResponse.json({ error: "Unknown project key." }, { status: 404 }));
    }
    const origin = await isWidgetOriginAllowed(request, project.id);
    if (!origin.ok) {
      return withWidgetCors(
        NextResponse.json({ error: `Domain '${origin.host}' is not authorized for this project.` }, { status: 403 })
      );
    }

    const counts = await db
      .select({ lang: translations.targetLanguage, n: sql<number>`count(*)::int` })
      .from(translations)
      .innerJoin(sourceStrings, eq(sourceStrings.id, translations.stringId))
      .where(and(eq(sourceStrings.projectId, project.id), eq(translations.status, "approved")))
      .groupBy(translations.targetLanguage);

    const source = languageInfo(project.sourceLanguage);
    const languages = [
      { ...source, count: null as number | null },
      ...counts
        .filter((c: { lang: string; n: number }) => c.n > 0 && c.lang !== project.sourceLanguage)
        .map((c: { lang: string; n: number }) => ({ ...languageInfo(c.lang), code: c.lang, count: c.n }))
        .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)),
    ];

    return withWidgetCors(
      NextResponse.json({ ok: true, project: project.name, sourceLanguage: project.sourceLanguage, languages }),
      "public, max-age=60, stale-while-revalidate=300"
    );
  } catch (err) {
    console.error("[widget/config]", err);
    return withWidgetCors(NextResponse.json({ error: "Widget configuration is unavailable." }, { status: 500 }));
  }
}

export function OPTIONS() {
  return withWidgetCors(new NextResponse(null, { status: 204 }));
}
