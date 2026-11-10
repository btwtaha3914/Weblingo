import { NextResponse } from "next/server";
import { db } from "@/db";
import { glossaryEntries, auditEvents } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const entries = await db
      .select()
      .from(glossaryEntries)
      .where(eq(glossaryEntries.projectId, Number(projectId)));

    return NextResponse.json({ ok: true, entries });
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
    const { projectId, sourceTerm, targetTerm, targetLanguage, notes } = body;

    if (!projectId || !sourceTerm || !targetTerm || !targetLanguage) {
      return NextResponse.json(
        { error: "projectId, sourceTerm, targetTerm, and targetLanguage are required." },
        { status: 400 }
      );
    }

    const pId = Number(projectId);

    const [saved] = await db
      .insert(glossaryEntries)
      .values({
        projectId: pId,
        sourceTerm: sourceTerm.trim(),
        targetTerm: targetTerm.trim(),
        targetLanguage: targetLanguage.toLowerCase().trim(),
        notes: notes ? notes.trim() : null,
      })
      .onConflictDoUpdate({
        target: [glossaryEntries.projectId, glossaryEntries.sourceTerm, glossaryEntries.targetLanguage],
        set: {
          targetTerm: targetTerm.trim(),
          notes: notes ? notes.trim() : null,
        },
      })
      .returning();

    await db.insert(auditEvents).values({
      projectId: pId,
      eventType: "glossary_term_saved",
      details: { sourceTerm, targetTerm, targetLanguage },
      ipAddress: "127.0.0.1",
    });

    return NextResponse.json({ ok: true, entry: saved });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Entry ID is required" }, { status: 400 });
    }

    await db.delete(glossaryEntries).where(eq(glossaryEntries.id, Number(id)));

    return NextResponse.json({ ok: true, message: "Glossary entry removed" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
