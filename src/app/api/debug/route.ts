import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const libreUrl = process.env.LIBRETRANSLATE_URL;
  const results: Record<string, unknown> = {
    libreTranslateUrl: libreUrl || "NOT SET",
    databaseUrl: process.env.DATABASE_URL ? "SET" : "NOT SET",
  };

  // Test LibreTranslate connectivity
  if (libreUrl) {
    try {
      const res = await fetch(`${libreUrl}/languages`, {
        signal: AbortSignal.timeout(5000),
      });
      results.libreTranslateStatus = res.status;
      results.libreTranslateOk = res.ok;
      if (res.ok) {
        const data = await res.json();
        results.libreTranslateLanguages = Array.isArray(data) ? data.length : "unknown";
      }
    } catch (err) {
      results.libreTranslateError = err instanceof Error ? err.message : String(err);
      results.libreTranslateOk = false;
    }
  }

  // Test database connectivity
  try {
    const { db } = await import("@/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`select 1`);
    results.databaseOk = true;
  } catch (err) {
    results.databaseError = err instanceof Error ? err.message : String(err);
    results.databaseOk = false;
  }

  return NextResponse.json(results);
}