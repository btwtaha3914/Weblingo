import { NextResponse } from "next/server";
import { getJobProgress, saveBrowserResults } from "@/lib/pipeline";
import { errorResponse, getAccessibleProject, HttpError } from "@/lib/access";
import { getUserIdFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 26;

/**
 * Saves translations made in the browser. Every result is validated like
 * server output; invalid ones come back in `rejected` and stay pending.
 * Body: { results: [{ stringId, text }], autoApprove?: boolean }
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const jobId = Number(id);
    if (!Number.isInteger(jobId) || jobId <= 0) throw new HttpError(400, "Invalid job id.");
    const progress = await getJobProgress(jobId);
    if (!progress) throw new HttpError(404, "Job not found.");
    await getAccessibleProject(progress.projectId, request);
    const body = await request.json().catch(() => {
      throw new HttpError(400, "Invalid JSON body.");
    });
    if (!Array.isArray(body.results) || body.results.length > 200) {
      throw new HttpError(400, "'results' must be an array of at most 200 items.");
    }
    const results = body.results
      .filter((r: unknown) => r && typeof r === "object")
      .map((r: { stringId?: unknown; text?: unknown }) => ({ stringId: Number(r.stringId), text: String(r.text ?? "") }));
    const saved = await saveBrowserResults(jobId, results, {
      autoApprove: body.autoApprove !== false,
      userId: getUserIdFromRequest(request),
      engine: "chrome-on-device",
    });
    return NextResponse.json({ ok: true, ...saved, job: saved.progress });
  } catch (err) {
    return errorResponse(err);
  }
}
