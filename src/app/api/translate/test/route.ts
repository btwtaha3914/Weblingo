import { NextResponse } from "next/server";
import { translateBatch, checkEngineHealth } from "@/lib/engine-manager";
import { errorResponse, HttpError, LANGUAGE_CODE_RE } from "@/lib/access";
import { getUserIdFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 26;

export async function GET() {
  const health = await checkEngineHealth();
  return NextResponse.json({ ok: health.online, engine_status: health });
}

/** Free-text translation for the playground. Body: { source_lang, target_lang, texts: string[] } */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => {
      throw new HttpError(400, "Invalid JSON body.");
    });
    const { source_lang = "en", target_lang = "es", texts = [] } = body;
    if (!Array.isArray(texts) || texts.length === 0 || texts.length > 50 || !texts.every((t) => typeof t === "string")) {
      throw new HttpError(400, "'texts' must be an array of 1-50 strings.");
    }
    if (texts.reduce((n: number, t: string) => n + t.length, 0) > 20000) {
      throw new HttpError(400, "Text is too long for a single request (20,000 characters max).");
    }
    if ((source_lang !== "auto" && !LANGUAGE_CODE_RE.test(source_lang)) || !LANGUAGE_CODE_RE.test(target_lang)) {
      throw new HttpError(400, "Invalid language code.");
    }
    const result = await translateBatch({
      source_lang,
      target_lang,
      texts,
      userId: getUserIdFromRequest(request),
      timeoutMs: 22000,
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
