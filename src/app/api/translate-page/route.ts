import { NextResponse } from "next/server";
import { fetchAndExtractPage, extractTranslatableText } from "@/lib/extractor";
import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import { createJob, storeExtraction } from "@/lib/pipeline";
import { errorResponse, getAccessibleProject, HttpError, parseLanguageList } from "@/lib/access";
import { isRtlLanguage } from "@/lib/engine-manager";

export const dynamic = "force-dynamic";
export const maxDuration = 26;

/**
 * Step 1 of translating a page: fetch + extract + store, then create a
 * translation job. The client then calls POST /api/jobs/:id until done.
 *
 * Body: { url | html, projectId, targetLanguages: string[] } (or a single targetLanguage)
 * One job is created per language; the page is extracted only once.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => {
      throw new HttpError(400, "Invalid JSON body.");
    });
    const { url, html } = body as { url?: unknown; html?: unknown };
    const { project, userId } = await getAccessibleProject(body.projectId, request);
    const targetLanguages = parseLanguageList(body.targetLanguages ?? body.targetLanguage, project.sourceLanguage);
    const targetLanguage = targetLanguages[0];

    let extraction;
    if (typeof html === "string" && html.trim()) {
      if (html.length > 5 * 1024 * 1024) throw new HttpError(400, "HTML content exceeds the 5 MB limit.");
      extraction = extractTranslatableText(html, typeof url === "string" && url ? url : "https://pasted-html.invalid/");
    } else if (typeof url === "string" && url.trim()) {
      try {
        extraction = await fetchAndExtractPage(url.trim());
      } catch (err) {
        throw new HttpError(422, err instanceof Error ? err.message : String(err));
      }
    } else {
      throw new HttpError(400, "Please enter a webpage URL.");
    }

    if (!extraction.strings.length) {
      throw new HttpError(
        422,
        extraction.likelyClientRendered
          ? "No text was found in the page HTML. This site appears to build its content with JavaScript in the browser; install the widget on it and visit the page so WebLingo can collect the text, then translate again."
          : "No translatable text was found on this page."
      );
    }

    const { page, strings } = await storeExtraction(project.id, extraction);
    const jobs = [];
    for (const lang of targetLanguages) {
      const job = await createJob(project.id, lang, page.id);
      jobs.push({ id: job.id, status: job.status, total: job.totalStrings, targetLanguage: lang, isRtl: isRtlLanguage(lang) });
    }
    const job = jobs[0];

    await db.insert(auditEvents).values({
      projectId: project.id,
      userId: userId ?? null,
      eventType: "page_extracted",
      details: { url: page.urlPath, unique: strings.length, occurrences: extraction.totalOccurrences, targetLanguages },
    });

    return NextResponse.json({
      ok: true,
      page: { id: page.id, title: page.title, urlPath: page.urlPath },
      extractedCount: extraction.totalOccurrences,
      uniqueCount: strings.length,
      alreadyTranslated: strings.length - job.total,
      targetLanguage,
      targetLanguages,
      isRtl: isRtlLanguage(targetLanguage),
      likelyClientRendered: extraction.likelyClientRendered,
      links: extraction.links.slice(0, 200),
      job: { id: job.id, status: job.status, total: job.total },
      jobs,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
