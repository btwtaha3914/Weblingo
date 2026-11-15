import { db } from "@/db";
import { sql } from "drizzle-orm";
import { checkEngineHealth } from "@/lib/engine-manager";

export const dynamic = "force-dynamic";

/** Reports database and LibreTranslate connectivity (no secrets). */
export async function GET() {
  let database = false;
  try {
    await db.execute(sql`select 1`);
    database = true;
  } catch {
    database = false;
  }
  const engine = await checkEngineHealth();
  const ok = database && engine.online;
  return Response.json(
    {
      ok,
      database,
      translationEngine: {
        online: engine.online,
        configured: engine.configured,
        status: engine.status,
        latencyMs: engine.latency_ms,
        languages: engine.installed_languages.length,
        error: engine.error,
      },
    },
    { status: ok ? 200 : 503 }
  );
}
