import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, sourceStrings, translations, projectDomains } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

function widgetError(message: string, status: number) {
  const response = NextResponse.json({ error: message }, { status });
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const apiKey = searchParams.get("key");
    const lang = searchParams.get("lang");

    if (!apiKey || !lang) {
      return widgetError("Missing required parameters 'key' and 'lang'.", 400);
    }

    const cleanLang = lang.toLowerCase().trim();

    // Find project by API key
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.apiKey, apiKey));

    if (!project) {
      return widgetError("Project not found or invalid API key.", 404);
    }

    const domains = await db
      .select()
      .from(projectDomains)
      .where(eq(projectDomains.projectId, project.id));

    // Origin / Referer check for security
    const origin = request.headers.get("origin") || request.headers.get("referer");
    if (origin && domains.length > 0) {
      try {
        const originHost = new URL(origin).hostname.toLowerCase();
        const appHost = new URL(request.url).hostname.toLowerCase();
        const allowedHosts = domains.map(d => d.domain.toLowerCase());
        const isSameOrigin = originHost === appHost;
        const isDev = process.env.NODE_ENV !== "production";
        const isAllowed =
          isSameOrigin ||
          isDev ||
          allowedHosts.some(h => originHost === h || originHost.endsWith("." + h) || originHost === "localhost" || originHost === "127.0.0.1");
        if (!isAllowed) {
          return widgetError(`Domain '${originHost}' is not authorized for this project.`, 403);
        }
      } catch {
        // Continue if URL parsing fails
      }
    }

    // Fetch approved translations
    const approvedRows = await db
      .select({
        hash: sourceStrings.contentHash,
        sourceText: sourceStrings.sourceText,
        translatedText: translations.translatedText,
      })
      .from(sourceStrings)
      .innerJoin(
        translations,
        and(
          eq(sourceStrings.id, translations.stringId),
          eq(translations.targetLanguage, cleanLang),
          eq(translations.status, "approved")
        )
      )
      .where(eq(sourceStrings.projectId, project.id));

    // Build translation dictionary mapping hash -> translatedText
    const dictionary: Record<string, string> = {};
    for (const row of approvedRows) {
      dictionary[row.hash] = row.translatedText;
    }

    const isRtl = ["ar", "ur", "he", "fa"].includes(cleanLang);

    const response = NextResponse.json({
      ok: true,
      project: project.name,
      sourceLanguage: project.sourceLanguage,
      targetLanguage: cleanLang,
      isRtl,
      translationsCount: Object.keys(dictionary).length,
      dictionary,
    });

    // Translation changes must become visible to the widget immediately.
    response.headers.set("Cache-Control", "no-store, max-age=0");
    response.headers.set("Access-Control-Allow-Origin", "*");
    return response;
  } catch (err) {
    return widgetError(err instanceof Error ? err.message : String(err), 500);
  }
}
