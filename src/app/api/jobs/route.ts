import { NextResponse } from "next/server";
import { createJob } from "@/lib/pipeline";
import { errorResponse, getAccessibleProject, HttpError, parseLanguageList } from "@/lib/access";
import { TranslationEngineError, isRtlLanguage } from "@/lib/engine-manager";

export const dynamic = "force-dynamic";

/**
 * Creates one translation job per language for every not-yet-translated string
 * of a project (or of one page when pageId is given).
 * Body: { projectId, targetLanguages: string[] (or targetLanguage), pageId? }
 * Response: { job (first), jobs: [...] }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => {
      throw new HttpError(400, "Invalid JSON body.");
    });
    const { project } = await getAccessibleProject(body.projectId, request);
    const targetLanguages = parseLanguageList(body.targetLanguages ?? body.targetLanguage, project.sourceLanguage);
    const pageId = body.pageId ? Number(body.pageId) : null;
    if (pageId !== null && (!Number.isInteger(pageId) || pageId <= 0)) throw new HttpError(400, "Invalid pageId.");
    try {
      const jobs = [];
      for (const lang of targetLanguages) {
        const job = await createJob(project.id, lang, pageId);
        jobs.push({ id: job.id, status: job.status, total: job.totalStrings, targetLanguage: lang, isRtl: isRtlLanguage(lang) });
      }
      return NextResponse.json({ ok: true, job: jobs[0], jobs });
    } catch (err) {
      if (err instanceof TranslationEngineError) throw new HttpError(err.retryable ? 503 : 400, err.message);
      throw err;
    }
  } catch (err) {
    return errorResponse(err);
  }
}
