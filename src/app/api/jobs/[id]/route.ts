import { NextResponse } from "next/server";
import { clampBatch, getJobProgress, getPageStrings, runJobStep } from "@/lib/pipeline";
import { errorResponse, getAccessibleProject, HttpError } from "@/lib/access";
import { getUserIdFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 26;

async function loadJob(idParam: string, request: Request) {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid job id.");
  const progress = await getJobProgress(id);
  if (!progress) throw new HttpError(404, "Job not found.");
  await getAccessibleProject(progress.projectId, request);
  return progress;
}

/** Job status. Add ?strings=1 to include the page's strings and translations. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const progress = await loadJob(id, request);
    const withStrings = new URL(request.url).searchParams.get("strings") === "1";
    const strings = withStrings && progress.pageId ? await getPageStrings(progress.pageId, progress.targetLanguage) : undefined;
    return NextResponse.json({ ok: true, job: progress, strings });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Runs one time-boxed translation step. Body: { autoApprove?: boolean, batchSize?: number (the previous step's nextBatchSize) } */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const progress = await loadJob(id, request);
    const body = await request.json().catch(() => ({}));
    const result = await runJobStep(progress.id, {
      autoApprove: body.autoApprove !== false,
      userId: getUserIdFromRequest(request),
      batchSize: clampBatch(body.batchSize),
    });
    return NextResponse.json({ ok: true, ...result, job: result.progress });
  } catch (err) {
    return errorResponse(err);
  }
}
