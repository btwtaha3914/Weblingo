/**
 * Data access for the public widget API.
 *
 * Caching note: Netlify's CDN ignores query strings when caching unless told
 * otherwise, so `?key=A&lang=es` and `?key=A&lang=ar` shared one cache entry
 * and visitors received the first language for every language. The widget
 * API therefore puts everything that identifies a response in the URL path:
 *
 *   /api/widget/p/{key}/config                    (cached 30 s)
 *   /api/widget/p/{key}/t/{lang}/{version}        (cached 1 day; version changes on every update)
 */
import { NextResponse } from "next/server";
import { db } from "@/db";
import { isWidgetOriginAllowed } from "./access";
import { projects, sourceStrings, translations } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { languageInfo } from "./languages";
import { isRtlLanguage } from "./engine-manager";

export const KEY_RE = /^[A-Za-z0-9_-]{8,80}$/;

export async function findProjectByKey(key: string) {
  if (!KEY_RE.test(key)) return null;
  return (await db.query.projects.findFirst({ where: eq(projects.apiKey, key) })) ?? null;
}

export async function getWidgetConfig(project: { id: number; name: string; sourceLanguage: string }) {
  const rows = await db
    .select({
      lang: translations.targetLanguage,
      n: sql<number>`count(*)::int`,
      v: sql<string>`floor(extract(epoch from max(${translations.updatedAt})))::bigint::text`,
    })
    .from(translations)
    .innerJoin(sourceStrings, eq(sourceStrings.id, translations.stringId))
    .where(and(eq(sourceStrings.projectId, project.id), eq(translations.status, "approved")))
    .groupBy(translations.targetLanguage);

  const source = languageInfo(project.sourceLanguage);
  const languages = [
    { ...source, code: project.sourceLanguage, count: null as number | null, version: null as string | null },
    ...rows
      .filter((r: { lang: string; n: number }) => r.n > 0 && r.lang !== project.sourceLanguage)
      .map((r: { lang: string; n: number; v: string }) => ({
        ...languageInfo(r.lang),
        code: r.lang,
        count: r.n,
        // Changes whenever any approved translation in this language changes.
        version: `${r.v}-${r.n}`,
      }))
      .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)),
  ];
  return { ok: true, project: project.name, sourceLanguage: project.sourceLanguage, languages };
}

export async function getWidgetDictionary(project: { id: number; sourceLanguage: string }, lang: string) {
  const rows = await db
    .select({ hash: sourceStrings.contentHash, translatedText: translations.translatedText })
    .from(sourceStrings)
    .innerJoin(
      translations,
      and(eq(sourceStrings.id, translations.stringId), eq(translations.targetLanguage, lang), eq(translations.status, "approved"))
    )
    .where(eq(sourceStrings.projectId, project.id));
  const dictionary: Record<string, string> = {};
  for (const row of rows) dictionary[row.hash] = row.translatedText;
  return {
    ok: true,
    sourceLanguage: project.sourceLanguage,
    targetLanguage: lang,
    isRtl: isRtlLanguage(lang),
    translationsCount: rows.length,
    dictionary,
  };
}

/**
 * Cache headers. `Netlify-CDN-Cache-Control` controls Netlify's edge;
 * `Cache-Control` the visitor's browser. `Netlify-Vary: query` makes the
 * legacy query-string endpoints cache per key/language too.
 */
export function cacheHeaders(edgeSeconds: number, browserSeconds: number) {
  return {
    "Cache-Control": `public, max-age=${browserSeconds}`,
    "Netlify-CDN-Cache-Control": `public, s-maxage=${edgeSeconds}, stale-while-revalidate=60`,
    // Separate edge cache entries per query string and per requesting site
    // (the domain allow-list makes responses depend on Origin).
    "Netlify-Vary": "query,header=Origin",
    Vary: "Origin",
  };
}

/** Errors must never be cached at the edge. */
export const NO_STORE = { "Cache-Control": "no-store", "Netlify-CDN-Cache-Control": "no-store" };

/** JSON response with public CORS and the given cache headers. */
export function widgetJson(body: unknown, status: number, headers: Record<string, string>) {
  const allHeaders = {
    ...headers,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (status === 204) return new NextResponse(null, { status, headers: allHeaders });
  return NextResponse.json(body, { status, headers: allHeaders });
}

/** Shared handler: project lookup + domain check, then `build` for the body. */
export async function handleWidgetGet(
  request: Request,
  key: string,
  edgeSeconds: number,
  browserSeconds: number,
  build: (project: NonNullable<Awaited<ReturnType<typeof findProjectByKey>>>) => Promise<unknown>
) {
  try {
    const project = await findProjectByKey(key);
    if (!project) return widgetJson({ error: "Unknown project key." }, 404, NO_STORE);
    const origin = await isWidgetOriginAllowed(request, project.id);
    if (!origin.ok) {
      return widgetJson({ error: `Domain '${origin.host}' is not authorized for this project.` }, 403, NO_STORE);
    }
    const headers = edgeSeconds > 0 ? cacheHeaders(edgeSeconds, browserSeconds) : NO_STORE;
    return widgetJson(await build(project), 200, headers);
  } catch (err) {
    console.error("[widget]", err);
    return widgetJson({ error: "Widget data is unavailable." }, 500, NO_STORE);
  }
}
