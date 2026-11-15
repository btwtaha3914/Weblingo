import { NextResponse } from "next/server";
import { clearDatabase } from "@/db/clear-db";
import { getUserIdFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Wipes all extracted pages, strings and translations.
 * Disabled in production unless ALLOW_DB_RESET=true, and always requires a
 * signed-in user.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DB_RESET !== "true") {
    return NextResponse.json({ error: "Database reset is disabled in production." }, { status: 403 });
  }
  if (!getUserIdFromRequest(request)) {
    return NextResponse.json({ error: "Please sign in to reset the database." }, { status: 401 });
  }
  try {
    await clearDatabase();
    return NextResponse.json({
      ok: true,
      message: "Database has been emptied successfully. All pages, strings, and translations removed.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
