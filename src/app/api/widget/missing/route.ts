import { NextResponse } from "next/server";
import { db } from "@/db";
import { pages, pageStrings, projects, sourceStrings } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { isWidgetOriginAllowed, withWidgetCors } from "@/lib/access";
import { hashSourceText } from "@/lib/auth";
import { isMeaningfulText, normalizeSkeleton, skeletonToPlainText } from "@/lib/segments";

export const dynamic = "force-dynamic";

const MAX_PER_REQUEST = 50;
const MAX_LENGTH = 2000;
const MAX_STRINGS_PER_PROJECT = Number(process.env.MAX_STRINGS_PER_PROJECT) || 20000;

/** Valid skeleton: escaped text plus balanced <gN></gN> placeholders only. */
function isValidSkeleton(s: string): boolean {
  if (s.length === 0 || s.length > MAX_LENGTH) return false;
  if (/<(?!\/?g\d+>)/.test(s)) return false;
  if (/&(?!amp;|lt;|gt;)/.test(s)) return false;
  return true;
}

/**
 * Best-effort report from the widget of text it saw on a live page but has no
 * translation for (typically JavaScript-rendered content that a plain HTTP
 * fetch cannot see). Strings are only stored, never translated here; the
 * project owner translates them from the dashboard. Origin-checked and capped.
 */
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 120_000) {
      return withWidgetCors(NextResponse.json({ error: "Payload too large." }, { status: 413 }));
    }
    let body: { key?: unknown; url?: unknown; strings?: unknown };
    try {
      body = JSON.parse(raw);
    } catch {
      return withWidgetCors(NextResponse.json({ error: "Invalid JSON." }, { status: 400 }));
    }
    const key = typeof body.key === "string" ? body.key : "";
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(key) || !Array.isArray(body.strings)) {
      return withWidgetCors(NextResponse.json({ error: "Invalid request." }, { status: 400 }));
    }
    const project = await db.query.projects.findFirst({ where: eq(projects.apiKey, key) });
    if (!project) return withWidgetCors(NextResponse.json({ error: "Unknown project key." }, { status: 404 }));

    const origin = await isWidgetOriginAllowed(request, project.id, true);
    if (!origin.ok) return withWidgetCors(NextResponse.json({ error: "Origin not allowed." }, { status: 403 }));

    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(sourceStrings)
      .where(eq(sourceStrings.projectId, project.id));
    if (n >= MAX_STRINGS_PER_PROJECT) {
      return withWidgetCors(NextResponse.json({ ok: true, stored: 0, reason: "project string limit reached" }));
    }

    const strings = (body.strings as unknown[])
      .slice(0, MAX_PER_REQUEST)
      .filter((s): s is string => typeof s === "string")
      .map((s) => normalizeSkeleton(s))
      .filter((s) => isValidSkeleton(s) && isMeaningfulText(skeletonToPlainText(s)));
    if (!strings.length) return withWidgetCors(NextResponse.json({ ok: true, stored: 0 }));

    const unique = [...new Map(strings.map((s) => [hashSourceText(s), s])).entries()];
    const inserted = await db
      .insert(sourceStrings)
      .values(
        unique.map(([hash, s]) => ({
          projectId: project.id,
          contentHash: hash,
          sourceText: s,
          wordCount: skeletonToPlainText(s).split(/\s+/).filter(Boolean).length,
          contextHint: "widget",
        }))
      )
      .onConflictDoNothing()
      .returning({ id: sourceStrings.id });

    // Attach to the page the visitor was on (only for the reporting origin's own URL).
    let pageUrl: URL | null = null;
    try {
      pageUrl = typeof body.url === "string" ? new URL(body.url) : null;
    } catch {
      pageUrl = null;
    }
    if (inserted.length && pageUrl && origin.host && pageUrl.hostname.toLowerCase() === origin.host) {
      const urlPath = pageUrl.origin + pageUrl.pathname;
      const [page] = await db
        .insert(pages)
        .values({ projectId: project.id, urlPath, title: pageUrl.pathname, extractionStatus: "widget" })
        .onConflictDoUpdate({ target: [pages.projectId, pages.urlPath], set: { updatedAt: new Date() } })
        .returning({ id: pages.id });
      await db.insert(pageStrings).values(inserted.map((r: { id: number }) => ({ pageId: page.id, stringId: r.id })));
    }

    return withWidgetCors(NextResponse.json({ ok: true, stored: inserted.length }));
  } catch (err) {
    console.error("[widget/missing]", err);
    return withWidgetCors(NextResponse.json({ error: "Could not record strings." }, { status: 500 }));
  }
}

export function OPTIONS() {
  return withWidgetCors(new NextResponse(null, { status: 204 }));
}
