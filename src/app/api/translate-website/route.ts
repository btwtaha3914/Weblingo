import { NextResponse } from "next/server";
import { fetchAndExtractPage } from "@/lib/extractor";
import { errorResponse, getAccessibleProject, HttpError } from "@/lib/access";
import { storeExtraction } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 26;

const MAX_PAGES_LIMIT = Number(process.env.MAX_PAGES_PER_SITE) || 25;

/**
 * Whole-site step 1: fetch the start page through the SSRF-safe fetcher,
 * store it, and return the same-origin pages discovered from its links.
 * The dashboard then extracts each listed page with POST /api/extract
 * (one request per page, so each stays within serverless time limits),
 * and finally creates one job with POST /api/jobs.
 *
 * Body: { baseUrl, projectId, maxPages }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => {
      throw new HttpError(400, "Invalid JSON body.");
    });
    const { project } = await getAccessibleProject(body.projectId, request);
    if (typeof body.baseUrl !== "string" || !body.baseUrl.trim()) throw new HttpError(400, "baseUrl is required.");
    const maxPages = Math.min(Math.max(Number(body.maxPages) || 10, 1), MAX_PAGES_LIMIT);

    let extraction;
    try {
      extraction = await fetchAndExtractPage(body.baseUrl.trim());
    } catch (err) {
      throw new HttpError(422, err instanceof Error ? err.message : String(err));
    }
    const { page, strings } = await storeExtraction(project.id, extraction);

    const start = new URL(extraction.finalUrl);
    const startKey = start.origin + start.pathname;
    const discovered = extraction.links
      .filter((l) => {
        const u = new URL(l);
        return u.origin + u.pathname !== startKey;
      })
      .slice(0, maxPages - 1);

    return NextResponse.json({
      ok: true,
      baseUrl: extraction.finalUrl,
      firstPage: { id: page.id, title: page.title, urlPath: page.urlPath, uniqueCount: strings.length },
      likelyClientRendered: extraction.likelyClientRendered,
      pages: discovered,
      totalLinksFound: extraction.links.length,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
