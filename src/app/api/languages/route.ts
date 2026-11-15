import { NextResponse } from "next/server";
import { getEngineLanguages, toEngineCode } from "@/lib/engine-manager";
import { LANGUAGE_CATALOG } from "@/lib/languages";

export const dynamic = "force-dynamic";

/** Languages the configured LibreTranslate server can translate English into. */
export async function GET() {
  try {
    const engine = await getEngineLanguages();
    const english = engine.find((l) => l.code === "en");
    const targets = new Set(english?.targets ?? engine.map((l) => l.code));
    const languages = LANGUAGE_CATALOG.filter((l) => l.code !== "en" && targets.has(toEngineCode(l.code)));
    return NextResponse.json({ ok: true, online: true, languages }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        online: false,
        error: err instanceof Error ? err.message : String(err),
        languages: LANGUAGE_CATALOG.filter((l) => l.code !== "en"),
      },
      { status: 503 }
    );
  }
}
