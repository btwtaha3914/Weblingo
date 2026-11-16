import { NextResponse } from "next/server";
import { claimForBrowser, getJobProgress } from "@/lib/pipeline";
import { errorResponse, getAccessibleProject, HttpError } from "@/lib/access";
import { getUserIdFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 26;

/**
 * Gives the dashboard a batch of pending strings to translate in the browser
 * (Chrome's on-device Translator). Body: { limit?: number, exclude?: number[], autoApprove?: boolean }
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const jobId = Number(id);
    if (!Number.isInteger(jobId) || jobId <= 0) throw new HttpError(400, "Invalid job id.");
    const progress = await getJobProgress(jobId);
    if (!progress) throw new HttpError(404, "Job not found.");
    await getAccessibleProject(progress.projectId, request);
    const body = await request.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 40, 1), 100);
    const exclude = Array.isArray(body.exclude)
      ? body.exclude.map(Number).filter((n: number) => Number.isInteger(n) && n > 0).slice(0, 5000)
      : [];
    const result = await claimForBrowser(jobId, {
      limit,
      excludeIds: exclude,
      autoApprove: body.autoApprove !== false,
      userId: getUserIdFromRequest(request),
    });
    return NextResponse.json({ ok: true, ...result, job: result.progress });
  } catch (err) {
    return errorResponse(err);
  }
}
