import { NextResponse } from "next/server";
import { db } from "@/db";
import { sourceStrings, translations, projects, auditEvents, pages, pageStrings } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { createJob } from "@/lib/pipeline";
import { errorResponse, getAccessibleProject } from "@/lib/access";
import { placeholdersMatch } from "@/lib/segments";

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

      const allowedStatuses = ["draft", "approved", "rejected"];
      const assignedStatus = action === "approve" ? "approved" : (allowedStatuses.includes(newStatus) ? newStatus : "draft");
      if (typeof translatedText !== "string" || !translatedText.trim()) {
        return NextResponse.json({ error: "Translation text cannot be empty." }, { status: 400 });
      }

      const [source] = await db.select().from(sourceStrings).where(eq(sourceStrings.id, Number(stringId)));
      if (!source) return NextResponse.json({ error: "String not found." }, { status: 404 });
      await getAccessibleProject(source.projectId, request);
      if (!placeholdersMatch(source.sourceText, translatedText.trim())) {
        return NextResponse.json(
          { error: "Keep every <gN>…</gN> marker from the source text (they stand for links and formatting) and do not add HTML tags." },
          { status: 400 }
        );
      }

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

    // Action 2: queue a job that translates every untranslated string (run via POST /api/jobs/:id)
    if (action === "translate_all" && projectId && targetLanguage) {
      const { project } = await getAccessibleProject(projectId, request);
      const job = await createJob(project.id, String(targetLanguage), null);
      return NextResponse.json({ ok: true, job: { id: job.id, status: job.status, total: job.totalStrings } });
    }

    return NextResponse.json({ error: "Invalid action specified." }, { status: 400 });
  } catch (err) {
    return errorResponse(err);
  }
}
