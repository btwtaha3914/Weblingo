import { NextResponse } from "next/server";
import { fetchAndExtractPage, extractTranslatableText, validateSafeUrl } from "@/lib/extractor";
import { db } from "@/db";
import { pages, sourceStrings, pageStrings, translations, auditEvents, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { translateBatch } from "@/lib/engine-manager";
import { getUserIdFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate text length to prevent oversized requests
    if (body.html && typeof body.html === "string" && body.html.length > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "HTML content exceeds 5MB limit." }, { status: 400 });
    }
    const {
      url,
      html,
      projectId = 1,
      targetLanguage = "es",
      autoTranslate = true,
      autoApprove = true,
    } = body;

    const pId = Number(projectId) || 1;

    let extraction;

    if (html && typeof html === "string") {
      extraction = extractTranslatableText(html, url || "https://custom-preview.local/page");
    } else if (url && typeof url === "string") {
      const validation = await validateSafeUrl(url);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      extraction = await fetchAndExtractPage(url);
    } else {
      return NextResponse.json(
        { error: "Please enter a valid webpage URL or provide HTML markup." },
        { status: 400 }
      );
    }

    if (!extraction.strings || extraction.strings.length === 0) {
      return NextResponse.json(
        { error: "No translatable text elements (headings, paragraphs, buttons) found on the provided page." },
        { status: 400 }
      );
    }

    // 1. Save or update the page record
    const [savedPage] = await db
      .insert(pages)
      .values({
        projectId: pId,
        urlPath: extraction.url,
        title: extraction.title,
        extractionStatus: "extracted",
        translationStatus: autoTranslate ? "translated" : "untranslated",
        stringCount: extraction.stringCount,
        lastExtractedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [pages.projectId, pages.urlPath],
        set: {
          title: extraction.title,
          stringCount: extraction.stringCount,
          extractionStatus: "extracted",
          translationStatus: autoTranslate ? "translated" : "untranslated",
          lastExtractedAt: new Date(),
        },
      })
      .returning();

    // 2. Insert or get source strings
    const storedStrings: { id: number; contentHash: string; sourceText: string; contextHint: string | null }[] = [];

    for (const item of extraction.strings) {
      const [strRow] = await db
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

      storedStrings.push(strRow);

      // Link to page
      await db
        .insert(pageStrings)
        .values({
          pageId: savedPage.id,
          stringId: strRow.id,
          domSelector: item.domSelector,
          occurrenceIndex: item.occurrenceIndex,
        })
        .onConflictDoNothing();
    }

    // 3. Auto-translate into selected language if requested
    let translatedCount = 0;
    const translatedResults: {
      stringId: number;
      sourceText: string;
      translatedText: string;
      status: string;
      contextHint: string | null;
    }[] = [];

    if (autoTranslate && targetLanguage) {
      const textsToTranslate = storedStrings.map((s) => s.sourceText);
      const userId = getUserIdFromRequest(request);
      const batchResult = await translateBatch({
        source_lang: "en",
        target_lang: targetLanguage,
        texts: textsToTranslate,
        userId,
        saveToShared: true,
      });

      const assignStatus = autoApprove ? "approved" : "draft";

      // Save translations in parallel (batch of 10)
      const SAVE_BATCH = 10;
      for (let i = 0; i < storedStrings.length; i += SAVE_BATCH) {
        const batch = storedStrings.slice(i, i + SAVE_BATCH);
        await Promise.all(
          batch.map((item, idx) => {
            const res = batchResult.translations[i + idx];
            const transText = res ? res.translated : item.sourceText;
            return db
              .insert(translations)
              .values({
                stringId: item.id,
                targetLanguage,
                translatedText: transText,
                status: assignStatus,
                isReviewed: autoApprove,
                reviewedAt: autoApprove ? new Date() : null,
                modelVersion: batchResult.model_version || "auto-engine",
              })
              .onConflictDoUpdate({
                target: [translations.stringId, translations.targetLanguage],
                set: {
                  translatedText: transText,
                  status: assignStatus,
                  isReviewed: autoApprove,
                  reviewedAt: autoApprove ? new Date() : null,
                  updatedAt: new Date(),
                },
              })
              .then(() => {
                translatedCount++;
                translatedResults.push({
                  stringId: item.id,
                  sourceText: item.sourceText,
                  translatedText: transText,
                  status: assignStatus,
                  contextHint: item.contextHint,
                });
              });
          })
        );
      }

      // Ensure the project includes this target language
      const projectRow = await db.query.projects.findFirst({
        where: eq(projects.id, pId),
      });
      if (projectRow) {
        const currentLangs = (projectRow.targetLanguages as string[]) || [];
        if (!currentLangs.includes(targetLanguage)) {
          await db
            .update(projects)
            .set({ targetLanguages: [...currentLangs, targetLanguage] })
            .where(eq(projects.id, pId));
        }
      }

      await db.insert(auditEvents).values({
        projectId: pId,
        eventType: "page_auto_translated",
        details: {
          url: extraction.url,
          targetLanguage,
          count: translatedCount,
          autoApproved: autoApprove,
        },
        ipAddress: "127.0.0.1",
      });
    }

    return NextResponse.json({
      ok: true,
      page: savedPage,
      extractedCount: extraction.stringCount,
      targetLanguage,
      autoApproved: autoApprove,
      translatedCount,
      strings: translatedResults.length > 0 ? translatedResults : storedStrings,
      isRtl: ["ar", "ur", "he", "fa"].includes(targetLanguage),
    });
  } catch (err) {
    console.error("[translate-page] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
