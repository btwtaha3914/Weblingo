import { db } from "@/db";
import {
  projects,
  pages,
  sourceStrings,
  translations,
  supportedLanguages,
  auditEvents,
  usageStatistics,
  projectDomains,
  installationTokens,
  users,
} from "@/db/schema";
import { eq, sql, desc, and } from "drizzle-orm";

export async function getDashboardOverview(userId?: number) {
  // Query real database values
  const [projectsCountRes] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projects);

  const [pagesCountRes] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pages);

  const [stringsCountRes] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sourceStrings);

  const [translationsApprovedRes] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(translations)
    .where(eq(translations.status, "approved"));

  const [translationsDraftRes] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(translations)
    .where(eq(translations.status, "draft"));

  const languages = await db.select().from(supportedLanguages);

  const recentProjects = await db
    .select()
    .from(projects)
    .orderBy(desc(projects.createdAt))
    .limit(5);

  const recentAudits = await db
    .select()
    .from(auditEvents)
    .orderBy(desc(auditEvents.createdAt))
    .limit(8);

  const totalStrings = stringsCountRes?.count || 0;
  const approvedCount = translationsApprovedRes?.count || 0;
  const draftCount = translationsDraftRes?.count || 0;

  // Approximate translation completion percentage
  // Each source string typically targets 3 languages (es, ar, ur)
  const estimatedTargetTranslations = Math.max(totalStrings * 3, 1);
  const progressPercent = Math.min(
    100,
    Math.round(((approvedCount + draftCount * 0.5) / estimatedTargetTranslations) * 100)
  );

  return {
    totalProjects: projectsCountRes?.count || 0,
    totalPages: pagesCountRes?.count || 0,
    totalStrings,
    approvedTranslations: approvedCount,
    draftTranslations: draftCount,
    untranslatedStrings: Math.max(0, totalStrings * 3 - (approvedCount + draftCount)),
    progressPercent,
    languages,
    recentProjects,
    recentAudits,
  };
}

export async function getProjectList(userId?: number) {
  return await db
    .select({
      id: projects.id,
      name: projects.name,
      baseUrl: projects.baseUrl,
      sourceLanguage: projects.sourceLanguage,
      targetLanguages: projects.targetLanguages,
      apiKey: projects.apiKey,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .orderBy(desc(projects.createdAt));
}

export async function getProjectDetails(projectId: number) {
  const [proj] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!proj) return null;

  const projectPages = await db
    .select()
    .from(pages)
    .where(eq(pages.projectId, projectId))
    .orderBy(desc(pages.createdAt));

  const domains = await db
    .select()
    .from(projectDomains)
    .where(eq(projectDomains.projectId, projectId));

  const [token] = await db
    .select()
    .from(installationTokens)
    .where(eq(installationTokens.projectId, projectId))
    .limit(1);

  return {
    project: proj,
    pages: projectPages,
    domains,
    installationToken: token?.token || null,
  };
}

export async function getProjectTranslations(projectId: number, targetLang?: string) {
  const conditions = [eq(sourceStrings.projectId, projectId)];

  const rows = await db
    .select({
      stringId: sourceStrings.id,
      sourceText: sourceStrings.sourceText,
      contextHint: sourceStrings.contextHint,
      translationId: translations.id,
      targetLanguage: translations.targetLanguage,
      translatedText: translations.translatedText,
      status: translations.status,
      isReviewed: translations.isReviewed,
      modelVersion: translations.modelVersion,
    })
    .from(sourceStrings)
    .leftJoin(translations, eq(sourceStrings.id, translations.stringId))
    .where(targetLang ? and(eq(sourceStrings.projectId, projectId), eq(translations.targetLanguage, targetLang)) : eq(sourceStrings.projectId, projectId));

  return rows;
}
