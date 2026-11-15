/**
 * One-time cleanup for databases used with WebLingo versions before the
 * engine rewrite. Those versions saved fake fallback "translations" such as
 * "[ES] Welcome" or "[AR: Welcome]" when LibreTranslate was unreachable, and
 * served them forever from translation memory.
 *
 * Deletes those rows so the strings are translated again on the next job.
 * Run with:  npm run db:purge-fallbacks          (dry run, counts only)
 *            npm run db:purge-fallbacks -- --yes (actually delete)
 */
import { config } from "dotenv";
config({ path: ".env" });

import { db, pool } from "./index";
import { sql } from "drizzle-orm";

const PATTERN = String.raw`^\[[A-Z]{2,3}(-[A-Z]+)?(\]|:)`;

async function main() {
  const apply = process.argv.includes("--yes");
  const tables = ["translations", "shared_translation_memory", "user_translation_memory"] as const;
  for (const table of tables) {
    const count = await db.execute(
      sql`select count(*)::int as n from ${sql.identifier(table)} where translated_text ~ ${PATTERN}`
    );
    const n = Number((count.rows?.[0] as { n?: number })?.n ?? 0);
    if (apply && n > 0) {
      await db.execute(sql`delete from ${sql.identifier(table)} where translated_text ~ ${PATTERN}`);
      console.log(`${table}: deleted ${n} fallback rows`);
    } else {
      console.log(`${table}: ${n} fallback rows${apply ? "" : " (dry run; pass --yes to delete)"}`);
    }
  }
  await pool?.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool?.end();
  process.exit(1);
});
