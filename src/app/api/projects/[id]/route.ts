import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectDomains, pages, sourceStrings, auditEvents } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const projectId = Number(params.id);

    if (!projectId || isNaN(projectId)) {
      return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const projectPages = await db
      .select()
      .from(pages)
      .where(eq(pages.projectId, projectId))
      .orderBy(desc(pages.createdAt));

    const domains = await db
      .select()
      .from(projectDomains)
      .where(eq(projectDomains.projectId, projectId));

    const [stringsCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sourceStrings)
      .where(eq(sourceStrings.projectId, projectId));

    return NextResponse.json({
      ok: true,
      project,
      pages: projectPages,
      domains,
      stats: {
        totalPages: projectPages.length,
        totalStrings: stringsCount?.count || 0,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const projectId = Number(params.id);

    if (!projectId || isNaN(projectId)) {
      return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
    }

    const body = await request.json();
    const { name, baseUrl, targetLanguages, isAutoPublish, allowedDomains } = body;

    const updateData: Partial<typeof projects.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (name && typeof name === "string") updateData.name = name.trim();
    if (baseUrl && typeof baseUrl === "string") updateData.baseUrl = baseUrl.trim();
    if (Array.isArray(targetLanguages)) updateData.targetLanguages = targetLanguages;
    if (typeof isAutoPublish === "boolean") updateData.isAutoPublish = isAutoPublish;

    const [updated] = await db
      .update(projects)
      .set(updateData)
      .where(eq(projects.id, projectId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Update domains if provided
    if (Array.isArray(allowedDomains)) {
      await db.delete(projectDomains).where(eq(projectDomains.projectId, projectId));
      for (const d of allowedDomains) {
        if (d && typeof d === "string" && d.trim()) {
          await db.insert(projectDomains).values({
            projectId,
            domain: d.trim(),
            isVerified: true,
          }).onConflictDoNothing();
        }
      }
    }

    await db.insert(auditEvents).values({
      projectId,
      eventType: "project_updated",
      details: { name: updated.name, baseUrl: updated.baseUrl },
      ipAddress: "127.0.0.1",
    });

    return NextResponse.json({ ok: true, project: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const projectId = Number(params.id);

    if (!projectId || isNaN(projectId)) {
      return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
    }

    await db.delete(projects).where(eq(projects.id, projectId));

    return NextResponse.json({ ok: true, message: "Project deleted successfully" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
