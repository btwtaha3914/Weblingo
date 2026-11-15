import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectDomains } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserIdFromRequest } from "./auth";

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export function errorResponse(err: unknown, fallbackStatus = 500) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  // TranslationEngineError (duck-typed to avoid an import cycle).
  if (err instanceof Error && typeof (err as { retryable?: unknown }).retryable === "boolean") {
    const retryable = (err as unknown as { retryable: boolean }).retryable;
    return NextResponse.json({ error: err.message, engine: true }, { status: retryable ? 503 : 400 });
  }
  console.error("[api]", err);
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: message }, { status: fallbackStatus });
}

/**
 * When REQUIRE_AUTH=true, dashboard APIs require a signed-in user who owns the
 * project. Otherwise (the default, single-tenant dashboard) any visitor of the
 * dashboard may use them; the session user is still recorded when present.
 */
export function authRequired(): boolean {
  return process.env.REQUIRE_AUTH === "true";
}

export function parseProjectId(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, "A valid projectId is required.");
  return n;
}

export async function getAccessibleProject(projectIdValue: unknown, request: Request) {
  const projectId = parseProjectId(projectIdValue);
  const userId = getUserIdFromRequest(request);
  if (authRequired() && !userId) throw new HttpError(401, "Please sign in.");
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) throw new HttpError(404, "Project not found.");
  if (authRequired() && project.userId !== userId) throw new HttpError(403, "You do not have access to this project.");
  return { project, userId };
}

export const LANGUAGE_CODE_RE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

export function parseLanguage(value: unknown): string {
  if (typeof value !== "string" || !LANGUAGE_CODE_RE.test(value.trim())) {
    throw new HttpError(400, "A valid target language code is required (for example 'es').");
  }
  return value.trim();
}

export const MAX_LANGUAGES_PER_REQUEST = 10;

/** Accepts one code or an array of codes; returns unique, validated codes (source language excluded). */
export function parseLanguageList(value: unknown, sourceLanguage: string): string[] {
  const raw = Array.isArray(value) ? value : [value];
  const langs = [...new Set(raw.map((v) => parseLanguage(v)))];
  const targets = langs.filter((l) => l !== sourceLanguage);
  if (!targets.length) throw new HttpError(400, "Choose at least one target language different from the source language.");
  if (targets.length > MAX_LANGUAGES_PER_REQUEST) {
    throw new HttpError(400, `Choose at most ${MAX_LANGUAGES_PER_REQUEST} languages at a time.`);
  }
  return targets;
}

/**
 * Checks the Origin/Referer of a widget request against the project's
 * allowed domains. Requests without an Origin/Referer (server-to-server,
 * privacy-stripped referrers) are allowed for read-only endpoints.
 */
export async function isWidgetOriginAllowed(request: Request, projectId: number, requireOrigin = false): Promise<{ ok: boolean; host: string | null }> {
  const origin = request.headers.get("origin") || request.headers.get("referer");
  if (!origin || origin === "null") return { ok: !requireOrigin, host: null };
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return { ok: false, host: null };
  }
  const appHost = new URL(request.url).hostname.toLowerCase();
  const publicAppHost = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_APP_URL || "").hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  if (host === appHost || (publicAppHost && host === publicAppHost)) return { ok: true, host };
  if (process.env.NODE_ENV !== "production" && (host === "localhost" || host === "127.0.0.1")) return { ok: true, host };

  const domains = await db.select().from(projectDomains).where(eq(projectDomains.projectId, projectId));
  if (domains.length === 0) return { ok: process.env.WIDGET_REQUIRE_DOMAINS !== "true", host };
  const allowed = domains.some((d: { domain: string }) => {
    const h = d.domain.toLowerCase().replace(/^https?:\/\//, "").replace(/[:/].*$/, "").replace(/^www\./, "");
    const bare = host.replace(/^www\./, "");
    return bare === h || bare.endsWith("." + h);
  });
  return { ok: allowed, host };
}

export function withWidgetCors(res: NextResponse, cacheControl = "no-store") {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  res.headers.set("Cache-Control", cacheControl);
  res.headers.set("Vary", "Origin");
  return res;
}
