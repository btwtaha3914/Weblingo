import { NextResponse } from "next/server";
import { translateBatch, checkEngineHealth } from "@/lib/engine-manager";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await checkEngineHealth();
  return NextResponse.json({
    ok: true,
    engine_status: health,
    zero_paid_api: true,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { source_lang = "en", target_lang = "es", texts = [] } = body;

    if (!Array.isArray(texts) || texts.length === 0) {
      return NextResponse.json(
        { error: "The 'texts' field must be a non-empty array of strings." },
        { status: 400 }
      );
    }

    const result = await translateBatch({
      source_lang,
      target_lang,
      texts,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
