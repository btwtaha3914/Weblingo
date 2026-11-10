import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectDomains, installationTokens, auditEvents } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const allProjects = await db
      .select()
      .from(projects)
      .orderBy(desc(projects.createdAt));

    return NextResponse.json({ ok: true, projects: allProjects });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, baseUrl, targetLanguages = ["es", "ar", "ur"], allowedDomains = [] } = body;

    if (!name || !baseUrl) {
      return NextResponse.json(
        { error: "Website name and baseUrl are required." },
        { status: 400 }
      );
    }

    // Default to owner ID 1 (demo user) if no custom auth header is set
    const userId = 1;
    const apiKey = "wl_" + crypto.randomBytes(24).toString("hex");

    const [newProj] = await db
      .insert(projects)
      .values({
        userId,
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        sourceLanguage: "en",
        targetLanguages: Array.isArray(targetLanguages) ? targetLanguages : ["es", "ar", "ur"],
        apiKey,
      })
      .returning();

    // Register domains
    const host = new URL(baseUrl).hostname;
    const domainsToAdd = Array.from(new Set([host, ...(Array.isArray(allowedDomains) ? allowedDomains : [])]));

    for (const d of domainsToAdd) {
      if (d) {
        await db.insert(projectDomains).values({
          projectId: newProj.id,
          domain: d,
          isVerified: true,
        }).onConflictDoNothing();
      }
    }

    // Generate installation token for widget embed
    const tokenStr = "wl_tok_" + crypto.randomBytes(20).toString("hex");
    await db.insert(installationTokens).values({
      projectId: newProj.id,
      token: tokenStr,
      domainWhitelist: domainsToAdd,
      isActive: true,
    });

    await db.insert(auditEvents).values({
      userId,
      projectId: newProj.id,
      eventType: "project_created",
      details: { name: newProj.name, baseUrl: newProj.baseUrl, languages: newProj.targetLanguages },
      ipAddress: "127.0.0.1",
    });

    return NextResponse.json({
      ok: true,
      project: newProj,
      token: tokenStr,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
