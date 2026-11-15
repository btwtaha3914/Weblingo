import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, sourceStrings, translations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { isWidgetOriginAllowed, withWidgetCors, LANGUAGE_CODE_RE } from "@/lib/access";
import { isRtlLanguage } from "@/lib/engine-manager";

export const dynamic = "force-dynamic";

/**
 * Public, read-only: approved translations for one language, keyed by the
 * SHA-256 of each segment skeleton (the widget computes the same hash).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key") || "";
    const lang = (searchParams.get("lang") || "").trim();
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(key) || !LANGUAGE_CODE_RE.test(lang)) {
      return withWidgetCors(NextResponse.json({ error: "Missing or invalid 'key' or 'lang'." }, { status: 400 }));
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

    const rows = await db
      .select({ hash: sourceStrings.contentHash, translatedText: translations.translatedText })
      .from(sourceStrings)
      .innerJoin(
        translations,
        and(
          eq(sourceStrings.id, translations.stringId),
          eq(translations.targetLanguage, lang),
          eq(translations.status, "approved")
        )
      )
      .where(eq(sourceStrings.projectId, project.id));

    const dictionary: Record<string, string> = {};
    for (const row of rows) dictionary[row.hash] = row.translatedText;

    return withWidgetCors(
      NextResponse.json({
        ok: true,
        sourceLanguage: project.sourceLanguage,
        targetLanguage: lang,
        isRtl: isRtlLanguage(lang),
        translationsCount: rows.length,
        dictionary,
      }),
      // Short edge cache: approvals show up within a minute.
      "public, max-age=60, stale-while-revalidate=300"
    );
  } catch (err) {
    console.error("[widget/translations]", err);
    return withWidgetCors(NextResponse.json({ error: "Translations are unavailable." }, { status: 500 }));
  }
}

export function OPTIONS() {
  return withWidgetCors(new NextResponse(null, { status: 204 }));
}
