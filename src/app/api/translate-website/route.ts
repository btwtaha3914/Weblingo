import { NextResponse } from "next/server";
import { fetchAndExtractPage, extractTranslatableText, validateSafeUrl } from "@/lib/extractor";
import { db } from "@/db";
import { pages, sourceStrings, pageStrings, translations, auditEvents, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { translateBatch } from "@/lib/engine-manager";
import { getUserIdFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Discover internal links from a page (same origin only)
function discoverLinks(html: string, baseUrl: string): string[] {
  const origin = new URL(baseUrl).origin;
  const linkRegex = /href=["']([^"']+)["']/gi;
  const links = new Set<string>();
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    try {
      const u = new URL(match[1], baseUrl);
      if (u.origin === origin && u.pathname !== new URL(baseUrl).pathname) {
        // Normalize: drop hash/query
        links.add(u.origin + u.pathname);
      }
    } catch {
      // skip
    }
  }
  return Array.from(links).slice(0, 20); // cap at 20 pages
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { baseUrl, projectId = 1, targetLanguage = "es", maxPages = 10 } = body;

    if (!baseUrl || typeof baseUrl !== "string") {
      return NextResponse.json({ error: "baseUrl is required." }, { status: 400 });
    }

    const validation = await validateSafeUrl(baseUrl);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const pId = Number(projectId) || 1;
    const userId = getUserIdFromRequest(request);

    // Collect URLs to translate: start page + discovered internal links
    const urlsToTranslate = [baseUrl.trim()];
    try {
      const firstPage = await fetchAndExtractPage(baseUrl.trim());
      // We need raw html to discover links; re-fetch
    } catch {
      // ignore
    }

    // Fetch raw html for link discovery
    try {
      const res = await fetch(baseUrl.trim(), {
        headers: { "User-Agent": "Mozilla/5.0 WebLingo/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const html = await res.text();
        const discovered = discoverLinks(html, baseUrl.trim());
        for (const u of discovered) {
          if (urlsToTranslate.length < maxPages && !urlsToTranslate.includes(u)) {
            urlsToTranslate.push(u);
          }
        }
      }
    } catch {
      // ignore discovery failure
    }

    const results: { url: string; extracted: number; translated: number }[] = [];

    for (const pageUrl of urlsToTranslate) {
      try {
        const extraction = await fetchAndExtractPage(pageUrl);
        if (!extraction.strings || extraction.strings.length === 0) {
          results.push({ url: pageUrl, extracted: 0, translated: 0 });
          continue;
        }

        // Save page
        const [savedPage] = await db
          .insert(pages)
          .values({
            projectId: pId,
            urlPath: extraction.url,
            title: extraction.title,
            extractionStatus: "extracted",
            translationStatus: "translated",
            stringCount: extraction.stringCount,
            lastExtractedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [pages.projectId, pages.urlPath],
            set: {
              title: extraction.title,
              stringCount: extraction.stringCount,
              extractionStatus: "extracted",
              translationStatus: "translated",
              lastExtractedAt: new Date(),
            },
          })
          .returning();

        // Save strings
        const storedStrings: { id: number; sourceText: string }[] = [];
        for (const item of extraction.strings) {
          const [strRow] = await db
            .insert(sourceStrings)
            .values({
              projectId: pId,
              contentHash: item.contentHash,
              sourceText: item.sourceText,
              wordCount: item.wordCount,
              contextHint: item.contextHint,
            })
            .onConflictDoUpdate({
              target: [sourceStrings.projectId, sourceStrings.contentHash],
              set: { contextHint: item.contextHint },
            })
            .returning();
          storedStrings.push(strRow);
          await db
            .insert(pageStrings)
            .values({
              pageId: savedPage.id,
              stringId: strRow.id,
              domSelector: item.domSelector,
              occurrenceIndex: item.occurrenceIndex,
            })
            .onConflictDoNothing();
        }

        // Translate
        const assignStatus = "approved";
        const textsToTranslate = storedStrings.map(s => s.sourceText);
        const batchResult = await translateBatch({
          source_lang: "en",
          target_lang: targetLanguage,
          texts: textsToTranslate,
          userId,
          saveToShared: true,
        });

        let translatedCount = 0;
        for (let i = 0; i < storedStrings.length; i++) {
          const item = storedStrings[i];
          const res = batchResult.translations[i];
          const transText = res ? res.translated : item.sourceText;
          await db
            .insert(translations)
            .values({
              stringId: item.id,
              targetLanguage,
              translatedText: transText,
              status: assignStatus,
              isReviewed: true,
              reviewedAt: new Date(),
              modelVersion: batchResult.model_version || "auto-engine",
            })
            .onConflictDoUpdate({
              target: [translations.stringId, translations.targetLanguage],
              set: {
                translatedText: transText,
                status: assignStatus,
                isReviewed: true,
                reviewedAt: new Date(),
                updatedAt: new Date(),
              },
            });
          translatedCount++;
        }

        await db.insert(auditEvents).values({
          projectId: pId,
          eventType: "website_page_translated",
          details: { url: pageUrl, targetLanguage, count: translatedCount },
          ipAddress: "127.0.0.1",
        });

        results.push({ url: pageUrl, extracted: extraction.stringCount, translated: translatedCount });
      } catch (err) {
        results.push({ url: pageUrl, extracted: 0, translated: 0 });
      }
    }

    // Ensure target language in project
    const projectRow = await db.query.projects.findFirst({ where: eq(projects.id, pId) });
    if (projectRow) {
      const currentLangs = (projectRow.targetLanguages as string[]) || [];
      if (!currentLangs.includes(targetLanguage)) {
        await db.update(projects).set({ targetLanguages: [...currentLangs, targetLanguage] }).where(eq(projects.id, pId));
      }
    }

    const totalPages = results.length;
    const totalTranslated = results.reduce((a, r) => a + r.translated, 0);

    return NextResponse.json({
      ok: true,
      baseUrl,
      targetLanguage,
      pagesProcessed: totalPages,
      totalTranslated,
      results,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}