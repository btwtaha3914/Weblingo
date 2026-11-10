import { NextResponse } from "next/server";
import { fetchAndExtractPage, extractTranslatableText, validateSafeUrl } from "@/lib/extractor";
import { db } from "@/db";
import { pages, sourceStrings, pageStrings, auditEvents } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url, html, projectId, saveToDatabase = false } = body;

    let result;

    if (html && typeof html === "string") {
      result = extractTranslatableText(html, url || "https://custom-input.local");
    } else if (url && typeof url === "string") {
      const validation = await validateSafeUrl(url);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      result = await fetchAndExtractPage(url);
    } else {
      return NextResponse.json(
        { error: "Please provide either a 'url' to fetch or raw 'html' to parse." },
        { status: 400 }
      );
    }

    // Optionally persist into database if projectId is supplied
    if (saveToDatabase && projectId) {
      const pId = Number(projectId);

      // Create or update page
      const [savedPage] = await db
        .insert(pages)
        .values({
          projectId: pId,
          urlPath: result.url,
          title: result.title,
          extractionStatus: "extracted",
          translationStatus: "untranslated",
          stringCount: result.stringCount,
          lastExtractedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [pages.projectId, pages.urlPath],
          set: {
            title: result.title,
            stringCount: result.stringCount,
            extractionStatus: "extracted",
            lastExtractedAt: new Date(),
          },
        })
        .returning();

      // Store deduplicated strings
      for (const item of result.strings) {
        const [savedString] = await db
          .insert(sourceStrings)
          .values({
            projectId: pId,
            contentHash: item.contentHash,
            sourceText: item.sourceText,
            wordCount: item.wordCount,
            contextHint: item.contextHint,
          })
          .onConflictDoUpdate({
            target: [sourceStrings.projectId, sourceStrings.contentHash],
            set: { contextHint: item.contextHint },
          })
          .returning();

        // Link string to page
        await db
          .insert(pageStrings)
          .values({
            pageId: savedPage.id,
            stringId: savedString.id,
            domSelector: item.domSelector,
            occurrenceIndex: item.occurrenceIndex,
          })
          .onConflictDoNothing();
      }

      await db.insert(auditEvents).values({
        projectId: pId,
        eventType: "page_extracted",
        details: { url: result.url, extractedCount: result.stringCount },
        ipAddress: "127.0.0.1",
      });
    }

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
