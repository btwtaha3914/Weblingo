import { NextResponse } from "next/server";
import { clearDatabase } from "@/db/clear-db";

export const dynamic = "force-dynamic";

export async function POST() {
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
