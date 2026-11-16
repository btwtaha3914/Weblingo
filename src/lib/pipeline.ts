/**
 * Website translation pipeline, designed for serverless limits (Netlify
 * functions stop synchronous requests after ~10 s by default, 26 s max).
 *
 *   1. storeExtraction()  – bulk-saves a page and its unique segments.
 *   2. createJob()        – records how many strings still need translating.
 *   3. runJobStep()       – called repeatedly by the dashboard; each call
 *      fills what it can from translation memory, then translates one
 *      time-boxed batch with LibreTranslate and saves it. The dashboard shows
 *      the real done/total counts between calls (no fake percentages).
 *
 * Translations are keyed by (string, language), so identical text is
 * translated once per project and reused across all pages, and translation
 * memory reuses it across projects.
 */

import { db } from "@/db";
import { auditEvents, pages, pageStrings, projects, sourceStrings, translationJobs, translations } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import type { ExtractionResult } from "./extractor";
import {
  TranslationEngineError,
  assertLanguagePair,
  lookupMemory,
  saveMemory,
  translateSegments,
} from "./engine-manager";

const STEP_BUDGET_MS = Number(process.env.JOB_STEP_BUDGET_MS) || 7000;
const DEFAULT_MS_PER_SEGMENT = Number(process.env.TRANSLATION_MS_PER_SEGMENT) || 700;
const MAX_BATCH = 40;
const DEFAULT_BATCH = 6;

/**
 * Batch sizing.
 *
 * LibreTranslate speed differs per language (measured on the production
 * server: es/ar ≈0.4 s, ur ≈0.6 s, fr up to ≈0.9 s per sentence) and with
 * server load. Serverless instances do not share memory, so the batch size is
 * carried between steps by the client: every step returns `nextBatchSize`,
 * computed from what this step actually measured, and the client sends it back
 * as `batchSize`. A timeout halves it; fast steps grow it.
 */
const speedByLanguage = new Map<string, number>(); // warm-instance hint only
function estimateMsPerSegment(lang: string) {
  return speedByLanguage.get(lang) ?? DEFAULT_MS_PER_SEGMENT;
}
function recordSpeed(lang: string, segments: number, ms: number) {
  if (segments < 1) return;
  const measured = (ms / segments) * 1.3; // 30% safety margin
  const prev = estimateMsPerSegment(lang);
  speedByLanguage.set(lang, Math.min(5000, Math.max(120, 0.5 * prev + 0.5 * measured)));
}

export function clampBatch(n: unknown): number | null {
  const v = Number(n);
  return Number.isInteger(v) && v >= 1 ? Math.min(v, MAX_BATCH) : null;
}

export interface StoredString {
  id: number;
  contentHash: string;
  sourceText: string;
  contextHint: string | null;
}

export async function storeExtraction(projectId: number, extraction: ExtractionResult) {
  const [page] = await db
    .insert(pages)
    .values({
      projectId,
      urlPath: extraction.finalUrl || extraction.url,
      title: extraction.title.slice(0, 255),
      extractionStatus: "extracted",
      stringCount: extraction.stringCount,
      lastExtractedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [pages.projectId, pages.urlPath],
      set: {
        title: extraction.title.slice(0, 255),
        stringCount: extraction.stringCount,
        extractionStatus: "extracted",
        lastExtractedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();

  const stored: StoredString[] = [];
  for (let i = 0; i < extraction.strings.length; i += 500) {
    const slice = extraction.strings.slice(i, i + 500);
    const rows = await db
      .insert(sourceStrings)
      .values(
        slice.map((s) => ({
          projectId,
          contentHash: s.contentHash,
          sourceText: s.sourceText,
          wordCount: s.wordCount,
          contextHint: s.contextHint,
        }))
      )
      .onConflictDoUpdate({
        target: [sourceStrings.projectId, sourceStrings.contentHash],
        set: { contextHint: sql`excluded.context_hint` },
      })
      .returning({
        id: sourceStrings.id,
        contentHash: sourceStrings.contentHash,
        sourceText: sourceStrings.sourceText,
        contextHint: sourceStrings.contextHint,
      });
    stored.push(...rows);
  }

  // Re-link the page to its current strings.
  await db.delete(pageStrings).where(eq(pageStrings.pageId, page.id));
  const byHash = new Map(extraction.strings.map((s) => [s.contentHash, s]));
  for (let i = 0; i < stored.length; i += 500) {
    const slice = stored.slice(i, i + 500);
    await db.insert(pageStrings).values(
      slice.map((s) => ({
        pageId: page.id,
        stringId: s.id,
        domSelector: byHash.get(s.contentHash)?.domSelector ?? null,
        occurrenceIndex: byHash.get(s.contentHash)?.occurrenceIndex ?? 0,
      }))
    );
  }

  return { page, strings: stored };
}

async function countPending(job: { projectId: number; pageId: number | null; targetLanguage: string; createdAt: Date }) {
  const pageJoin = job.pageId
    ? sql`join page_strings ps on ps.string_id = s.id and ps.page_id = ${job.pageId}`
    : sql``;
  const res = await db.execute(sql`
    select count(distinct s.id)::int as n
    from source_strings s
    ${pageJoin}
    left join translations t on t.string_id = s.id and t.target_language = ${job.targetLanguage}
    where s.project_id = ${job.projectId}
      and (t.id is null or (t.status = 'failed' and t.updated_at < ${job.createdAt}))
  `);
  return Number((res.rows?.[0] as { n?: number })?.n ?? 0);
}

async function selectPending(
  job: { projectId: number; pageId: number | null; targetLanguage: string; createdAt: Date },
  limit: number
): Promise<{ id: number; source_text: string }[]> {
  const pageJoin = job.pageId
    ? sql`join page_strings ps on ps.string_id = s.id and ps.page_id = ${job.pageId}`
    : sql``;
  const res = await db.execute(sql`
    select distinct s.id, s.source_text
    from source_strings s
    ${pageJoin}
    left join translations t on t.string_id = s.id and t.target_language = ${job.targetLanguage}
    where s.project_id = ${job.projectId}
      and (t.id is null or (t.status = 'failed' and t.updated_at < ${job.createdAt}))
    order by s.id
    limit ${limit}
  `);
  return (res.rows || []) as { id: number; source_text: string }[];
}

async function countFailed(job: { id: number; projectId: number; pageId: number | null; targetLanguage: string; createdAt: Date }) {
  const pageJoin = job.pageId
    ? sql`join page_strings ps on ps.string_id = s.id and ps.page_id = ${job.pageId}`
    : sql``;
  const res = await db.execute(sql`
    select count(distinct s.id)::int as n
    from source_strings s
    ${pageJoin}
    join translations t on t.string_id = s.id and t.target_language = ${job.targetLanguage}
    where s.project_id = ${job.projectId} and t.status = 'failed' and t.updated_at >= ${job.createdAt}
  `);
  return Number((res.rows?.[0] as { n?: number })?.n ?? 0);
}

export async function createJob(projectId: number, targetLanguage: string, pageId: number | null) {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) throw new Error("Project not found.");
  await assertLanguagePair(project.sourceLanguage, targetLanguage);

  const createdAt = new Date();
  const total = await countPending({ projectId, pageId, targetLanguage, createdAt });
  const [job] = await db
    .insert(translationJobs)
    .values({
      projectId,
      pageId,
      targetLanguage,
      status: total === 0 ? "completed" : "pending",
      totalStrings: total,
      completedStrings: 0,
      createdAt,
      updatedAt: createdAt,
    })
    .returning();

  const langs = (project.targetLanguages as string[]) || [];
  if (!langs.includes(targetLanguage)) {
    await db
      .update(projects)
      .set({ targetLanguages: [...langs, targetLanguage], updatedAt: new Date() })
      .where(eq(projects.id, projectId));
  }
  return job;
}

export interface JobProgress {
  id: number;
  projectId: number;
  pageId: number | null;
  targetLanguage: string;
  status: string;
  total: number;
  done: number;
  failed: number;
  remaining: number;
  lastError: string | null;
}

export async function getJobProgress(jobId: number): Promise<JobProgress | null> {
  const job = await db.query.translationJobs.findFirst({ where: eq(translationJobs.id, jobId) });
  if (!job) return null;
  const remaining = job.status === "completed" || job.status === "completed_with_errors" ? 0 : await countPending(job);
  const failed = await countFailed(job);
  return {
    id: job.id,
    projectId: job.projectId,
    pageId: job.pageId,
    targetLanguage: job.targetLanguage,
    status: job.status,
    total: job.totalStrings,
    done: Math.max(0, job.totalStrings - remaining - failed),
    failed,
    remaining,
    lastError: job.errorMessage,
  };
}

async function saveTranslations(
  rows: { stringId: number; text: string; status: string; model: string }[],
  targetLanguage: string
) {
  if (!rows.length) return;
  const now = new Date();
  await db
    .insert(translations)
    .values(
      rows.map((r) => ({
        stringId: r.stringId,
        targetLanguage,
        translatedText: r.text,
        status: r.status,
        isReviewed: false,
        modelVersion: r.model,
        updatedAt: now,
      }))
    )
    .onConflictDoUpdate({
      target: [translations.stringId, translations.targetLanguage],
      set: {
        translatedText: sql`excluded.translated_text`,
        status: sql`excluded.status`,
        modelVersion: sql`excluded.model_version`,
        isReviewed: false,
        updatedAt: now,
      },
      // Never overwrite a human-reviewed translation with machine output.
      setWhere: sql`${translations.isReviewed} = false`,
    });
}

/** Runs one time-boxed step of a job. Safe to call repeatedly and concurrently. */
export async function runJobStep(
  jobId: number,
  opts: { autoApprove: boolean; userId?: number; budgetMs?: number; batchSize?: number | null }
): Promise<{
  progress: JobProgress;
  translated: number;
  fromMemory: number;
  failedNow: number;
  durationMs: number;
  batchSize: number;
  nextBatchSize: number;
}> {
  const started = Date.now();
  const deadline = started + Math.min(opts.budgetMs ?? STEP_BUDGET_MS, 20000);
  const job = await db.query.translationJobs.findFirst({ where: eq(translationJobs.id, jobId) });
  if (!job) throw new Error("Job not found.");
  const project = await db.query.projects.findFirst({ where: eq(projects.id, job.projectId) });
  if (!project) throw new Error("Project not found.");
  const src = project.sourceLanguage;
  const tgt = job.targetLanguage;
  const okStatus = opts.autoApprove ? "approved" : "draft";

  let translated = 0;
  let fromMemory = 0;
  let failedNow = 0;
  let lastError: string | null = job.errorMessage;
  let batchSize = 0;
  let nextBatchSize = opts.batchSize ?? DEFAULT_BATCH;

  if (job.status !== "completed" && job.status !== "completed_with_errors") {
    if (job.status === "pending") {
      await db.update(translationJobs).set({ status: "in_progress", updatedAt: new Date() }).where(eq(translationJobs.id, jobId));
    }

    // 1) Translation memory: instant, no engine call.
    let pending = await selectPending(job, 400);
    if (pending.length) {
      const memory = await lookupMemory(opts.userId, pending.map((p) => p.source_text), src, tgt);
      const hits = pending.filter((p) => memory.has(p.source_text));
      await saveTranslations(
        hits.map((h) => ({ stringId: h.id, text: memory.get(h.source_text)!, status: okStatus, model: "translation-memory" })),
        tgt
      );
      fromMemory = hits.length;
      const hitIds = new Set(hits.map((h) => h.id));
      pending = pending.filter((p) => !hitIds.has(p.id));
    }

    // 2) LibreTranslate: a batch sized to fit the remaining time.
    const remainingMs = deadline - Date.now() - 800;
    const fitBySpeed = Math.max(1, Math.floor(remainingMs / estimateMsPerSegment(tgt)));
    const size = Math.max(1, Math.min(opts.batchSize ?? DEFAULT_BATCH, fitBySpeed, MAX_BATCH));
    if (pending.length && remainingMs > 1000) {
      const batch = pending.slice(0, size);
      batchSize = batch.length;
      try {
        const engineStart = Date.now();
        const results = await translateSegments(batch.map((b) => b.source_text), src, tgt, deadline);
        const elapsed = Date.now() - engineStart;
        const okCount = results.filter((r) => r.ok).length;
        const timedOut = results.some((r) => !r.ok && r.deferred && /timed out|too long/i.test(r.error));
        recordSpeed(tgt, okCount, elapsed);
        if (okCount > 0) {
          // Grow (or shrink) toward what fits in a full step at the measured speed.
          const perSeg = (elapsed / okCount) * 1.3;
          const fit = Math.floor((STEP_BUDGET_MS - 1500) / perSeg);
          nextBatchSize = Math.max(1, Math.min(MAX_BATCH, fit, timedOut ? okCount : batch.length * 2));
        } else if (timedOut) {
          nextBatchSize = Math.max(1, Math.floor(batch.length / 2));
          if (batch.length === 1) {
            // A single string that cannot be translated within the time limit:
            // report it instead of retrying forever, so the job keeps moving.
            results[0] = {
              ok: false,
              deferred: false,
              error: "LibreTranslate took longer than the time limit for this text (it may be very long)",
            };
          }
        }
        const okRows: { stringId: number; text: string; status: string; model: string }[] = [];
        const failRows: { stringId: number; text: string; status: string; model: string }[] = [];
        const memoryRows: { sourceText: string; translatedText: string }[] = [];
        results.forEach((r, i) => {
          const item = batch[i];
          if (r.ok) {
            okRows.push({ stringId: item.id, text: r.text, status: okStatus, model: "libretranslate" });
            memoryRows.push({ sourceText: item.source_text, translatedText: r.text });
          } else if (!r.deferred) {
            // Keep the original text and mark it failed so it is reported, never shown as a translation.
            failRows.push({ stringId: item.id, text: item.source_text, status: "failed", model: "libretranslate" });
            lastError = r.error;
          } else if (r.error !== "not attempted") {
            lastError = r.error;
          }
        });
        await saveTranslations(okRows, tgt);
        await saveTranslations(failRows, tgt);
        await saveMemory(opts.userId, memoryRows, src, tgt).catch((err) => console.error("[pipeline] memory save failed", err));
        translated = okRows.length;
        failedNow = failRows.length;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (err instanceof TranslationEngineError && !err.retryable) {
          await db
            .update(translationJobs)
            .set({ status: "failed", errorMessage: lastError, updatedAt: new Date() })
            .where(eq(translationJobs.id, jobId));
        }
      }
    }

    const remaining = await countPending(job);
    const failed = await countFailed(job);
    const finished = remaining === 0;
    const current = await db.query.translationJobs.findFirst({ where: eq(translationJobs.id, jobId) });
    await db
      .update(translationJobs)
      .set({
        status: current?.status === "failed" ? "failed" : finished ? (failed ? "completed_with_errors" : "completed") : "in_progress",
        completedStrings: Math.max(0, job.totalStrings - remaining - failed),
        errorMessage: lastError,
        updatedAt: new Date(),
      })
      .where(eq(translationJobs.id, jobId));

    if (finished) {
      if (job.pageId) {
        await db
          .update(pages)
          .set({ translationStatus: failed ? "partial" : "translated", updatedAt: new Date() })
          .where(eq(pages.id, job.pageId));
      }
      await db.insert(auditEvents).values({
        projectId: job.projectId,
        userId: opts.userId ?? null,
        eventType: "translation_job_completed",
        details: { jobId, targetLanguage: tgt, total: job.totalStrings, failed },
      });
    }
  }

  const progress = (await getJobProgress(jobId))!;
  return { progress, translated, fromMemory, failedNow, durationMs: Date.now() - started, batchSize, nextBatchSize };
}

/** Segments of one page with their translation for a language (for the results table). */
export async function getPageStrings(pageId: number, targetLanguage: string, limit = 1000) {
  return db
    .select({
      stringId: sourceStrings.id,
      sourceText: sourceStrings.sourceText,
      contextHint: sourceStrings.contextHint,
      translatedText: translations.translatedText,
      status: translations.status,
    })
    .from(pageStrings)
    .innerJoin(sourceStrings, eq(sourceStrings.id, pageStrings.stringId))
    .leftJoin(translations, and(eq(translations.stringId, sourceStrings.id), eq(translations.targetLanguage, targetLanguage)))
    .where(eq(pageStrings.pageId, pageId))
    .orderBy(pageStrings.occurrenceIndex)
    .limit(limit);
}
