import { config } from "dotenv";
config({ path: ".env" });

import { db, pool } from "./index";
import {
  translations,
  pageStrings,
  sourceStrings,
  pages,
  translationJobs,
  glossaryEntries,
  auditEvents,
  usageStatistics,
  projects,
  users,
  projectDomains,
  installationTokens,
  supportedLanguages,
} from "./schema";
import { hashPassword } from "../lib/auth";
import { eq } from "drizzle-orm";

export async function clearDatabase() {
  console.log("🧹 Clearing all extracted pages, strings, translations, and logs...");

  // 1. Delete all translation and content data
  await db.delete(translations);
  await db.delete(pageStrings);
  await db.delete(sourceStrings);
  await db.delete(pages);
  await db.delete(translationJobs);
  await db.delete(glossaryEntries);
  await db.delete(auditEvents);
  await db.delete(usageStatistics);

  console.log("✓ Cleared translations, pages, source_strings, jobs, glossary, and audit events.");

  // 2. Ensure base demo user exists
  const demoEmail = "demo@weblingo.local";
  let existingUser = await db.query.users?.findFirst({
    where: eq(users.email, demoEmail),
  });

  let userId: number;
  if (!existingUser) {
    const [newUser] = await db
      .insert(users)
      .values({
        email: demoEmail,
        passwordHash: hashPassword("demo12345"),
        fullName: "Demo Administrator",
        role: "owner",
      })
      .returning();
    userId = newUser.id;
  } else {
    userId = existingUser.id;
  }

  // 3. Ensure a clean active project with 0 strings and 0 pages exists
  const demoProjectApiKey = "wl_live_demo_key_77889900aabbccdd";
  const [cleanProj] = await db
    .insert(projects)
    .values({
      userId,
      name: "My Website Project",
      baseUrl: "https://example.com",
      sourceLanguage: "en",
      targetLanguages: ["es", "ar", "ur", "fr", "de"],
      isAutoPublish: true,
      apiKey: demoProjectApiKey,
    })
    .onConflictDoUpdate({
      target: projects.apiKey,
      set: {
        name: "My Website Project",
        baseUrl: "https://example.com",
        targetLanguages: ["es", "ar", "ur", "fr", "de"],
        isAutoPublish: true,
      },
    })
    .returning();

  // 4. Ensure domain access
  const domainsToSeed = ["localhost", "127.0.0.1", "demo.weblingo.local"];
  for (const domain of domainsToSeed) {
    await db
      .insert(projectDomains)
      .values({
        projectId: cleanProj.id,
        domain,
        isVerified: true,
      })
      .onConflictDoNothing();
  }

  // 5. Ensure installation token exists
  await db
    .insert(installationTokens)
    .values({
      projectId: cleanProj.id,
      token: "wl_tok_live_7a8b9c0d1e2f3g4h",
      domainWhitelist: domainsToSeed,
      isActive: true,
    })
    .onConflictDoNothing();

  console.log("🎉 Database is now completely clean and ready for fresh testing!");
}

async function main() {
  try {
    await clearDatabase();
    process.exit(0);
  } catch (err) {
    console.error("Failed to clear database:", err);
    process.exit(1);
  } finally {
    if (pool) await pool.end();
  }
}

if (process.argv[1]?.endsWith("clear-db.ts")) {
  main();
}
