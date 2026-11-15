import { NextResponse } from "next/server";
import { checkEngineHealth } from "@/lib/engine-manager";
import { getUserIdFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Detailed diagnostics. In production only for signed-in users; use /api/health for public checks. */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production" && !getUserIdFromRequest(request)) {
    return NextResponse.json({ error: "Sign in to view diagnostics. Public status: /api/health" }, { status: 401 });
  }
  const results: Record<string, unknown> = {
    databaseUrl: process.env.DATABASE_URL ? "SET" : "NOT SET",
    jwtSecret: process.env.JWT_SECRET ? "SET" : "NOT SET",
    publicAppUrl: process.env.NEXT_PUBLIC_APP_URL || "NOT SET",
    translationEngine: await checkEngineHealth(),
  };
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
