import { NextResponse } from "next/server";
import { fetchAndExtractPage, extractTranslatableText } from "@/lib/extractor";
import { errorResponse, getAccessibleProject, HttpError } from "@/lib/access";
import { storeExtraction } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 26;

/**
 * Extracts translatable text from a URL (or pasted HTML).
 * Body: { url | html, projectId?, saveToDatabase? }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => {
      throw new HttpError(400, "Invalid JSON body.");
    });
    const { url, html, saveToDatabase = false } = body as { url?: unknown; html?: unknown; saveToDatabase?: boolean };

    let result;
    if (typeof html === "string" && html.trim()) {
      if (html.length > 5 * 1024 * 1024) throw new HttpError(400, "HTML content exceeds the 5 MB limit.");
      result = extractTranslatableText(html, typeof url === "string" && url ? url : "https://pasted-html.invalid/");
    } else if (typeof url === "string" && url.trim()) {
      try {
        result = await fetchAndExtractPage(url.trim());
      } catch (err) {
        throw new HttpError(422, err instanceof Error ? err.message : String(err));
      }
    } else {
      throw new HttpError(400, "Please provide either a 'url' to fetch or raw 'html' to parse.");
    }

    let saved: { pageId: number; uniqueCount: number } | null = null;
    if (saveToDatabase) {
      const { project } = await getAccessibleProject(body.projectId, request);
      const { page, strings } = await storeExtraction(project.id, result);
      saved = { pageId: page.id, uniqueCount: strings.length };
    }

    return NextResponse.json({ ok: true, result, saved });
  } catch (err) {
    return errorResponse(err);
  }
}
