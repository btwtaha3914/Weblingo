import { NextResponse } from "next/server";
import { db } from "@/db";
import { sourceStrings, translations, projects, auditEvents, pages, pageStrings } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { translateBatch } from "@/lib/engine-manager";
import { getUserIdFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const targetLang = searchParams.get("targetLang");

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const pId = Number(projectId);

    const stringList = await db
      .select({
        stringId: sourceStrings.id,
        contentHash: sourceStrings.contentHash,
        sourceText: sourceStrings.sourceText,
        contextHint: sourceStrings.contextHint,
        wordCount: sourceStrings.wordCount,
        translationId: translations.id,
        targetLanguage: translations.targetLanguage,
        translatedText: translations.translatedText,
        status: translations.status,
        isReviewed: translations.isReviewed,
        modelVersion: translations.modelVersion,
      })
      .from(sourceStrings)
      .leftJoin(
        translations,
        targetLang
          ? and(eq(sourceStrings.id, translations.stringId), eq(translations.targetLanguage, targetLang))
          : eq(sourceStrings.id, translations.stringId)
      )
      .where(eq(sourceStrings.projectId, pId));

    return NextResponse.json({ ok: true, strings: stringList });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, stringId, targetLanguage, translatedText, status: newStatus, projectId } = body;

    // Action 1: Update or Approve an existing translation
    if (action === "update" || action === "approve") {
      if (!stringId || !targetLanguage || translatedText === undefined) {
        return NextResponse.json(
          { error: "stringId, targetLanguage, and translatedText are required." },
          { status: 400 }
        );
      }

      const assignedStatus = action === "approve" ? "approved" : (newStatus || "draft");

      const [updated] = await db
        .insert(translations)
        .values({
          stringId: Number(stringId),
          targetLanguage,
          translatedText,
          status: assignedStatus,
          isReviewed: assignedStatus === "approved",
          reviewedAt: assignedStatus === "approved" ? new Date() : null,
          modelVersion: "human-reviewed",
        })
        .onConflictDoUpdate({
          target: [translations.stringId, translations.targetLanguage],
          set: {
            translatedText,
            status: assignedStatus,
            isReviewed: assignedStatus === "approved",
            reviewedAt: assignedStatus === "approved" ? new Date() : null,
            updatedAt: new Date(),
          },
        })
        .returning();

      return NextResponse.json({ ok: true, translation: updated });
    }

    // Action 2: Batch translate all untranslated strings for a project and target language
    if (action === "translate_all" && projectId && targetLanguage) {
      const pId = Number(projectId);
      const allStrings = await db
        .select()
        .from(sourceStrings)
        .where(eq(sourceStrings.projectId, pId));

      if (allStrings.length === 0) {
        return NextResponse.json({ ok: true, message: "No strings found to translate." });
      }

      const textsToTranslate = allStrings.map((s: { sourceText: string }) => s.sourceText);
      const userId = getUserIdFromRequest(request);
      const batchResult = await translateBatch({
        source_lang: "en",
        target_lang: targetLanguage,
        texts: textsToTranslate,
        userId,
        saveToShared: true,
      });

      // Store generated translations
      for (let i = 0; i < allStrings.length; i++) {
        const item = allStrings[i];
        const transResult = batchResult.translations[i];
        if (transResult) {
          await db
            .insert(translations)
            .values({
              stringId: item.id,
              targetLanguage,
              translatedText: transResult.translated,
              status: "draft",
              modelVersion: batchResult.model_version,
            })
            .onConflictDoUpdate({
              target: [translations.stringId, translations.targetLanguage],
              set: {
                translatedText: transResult.translated,
                updatedAt: new Date(),
              },
            });
        }
      }

      await db.insert(auditEvents).values({
        projectId: pId,
        eventType: "batch_translation_completed",
        details: { targetLanguage, count: allStrings.length, durationMs: batchResult.duration_ms },
        ipAddress: "127.0.0.1",
      });

      return NextResponse.json({
        ok: true,
        count: allStrings.length,
        duration_ms: batchResult.duration_ms,
      });
    }

    return NextResponse.json({ error: "Invalid action specified." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
