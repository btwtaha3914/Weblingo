import {
  pgTable,
  serial,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// 1. Users Table
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    role: varchar("role", { length: 50 }).default("owner").notNull(), // owner, editor, reviewer
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("users_email_idx").on(table.email),
  ]
);

// 2. Projects Table
export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    baseUrl: text("base_url").notNull(),
    sourceLanguage: varchar("source_language", { length: 10 }).default("en").notNull(),
    targetLanguages: jsonb("target_languages")
      .$type<string[]>()
      .default(["es", "ar", "ur"])
      .notNull(),
    isAutoPublish: boolean("is_auto_publish").default(false).notNull(),
    apiKey: varchar("api_key", { length: 64 }).notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("projects_user_id_idx").on(table.userId),
    uniqueIndex("projects_api_key_idx").on(table.apiKey),
  ]
);

// 3. Project Domains (Allowed origins for widget script)
export const projectDomains = pgTable(
  "project_domains",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    domain: varchar("domain", { length: 255 }).notNull(),
    isVerified: boolean("is_verified").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("project_domains_project_id_idx").on(table.projectId),
    uniqueIndex("project_domains_unique_idx").on(table.projectId, table.domain),
  ]
);

// 4. Languages Catalogue
export const supportedLanguages = pgTable(
  "supported_languages",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 10 }).notNull().unique(),
    name: varchar("name", { length: 100 }).notNull(),
    nativeName: varchar("native_name", { length: 100 }).notNull(),
    isRtl: boolean("is_rtl").default(false).notNull(),
    isInstalled: boolean("is_installed").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("languages_code_idx").on(table.code),
  ]
);

// 5. Pages Table
export const pages = pgTable(
  "pages",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    urlPath: text("url_path").notNull(), // e.g. "/about" or "https://example.com/about"
    title: varchar("title", { length: 255 }).default("Untitled Page").notNull(),
    extractionStatus: varchar("extraction_status", { length: 50 }).default("pending").notNull(), // pending, extracted, failed
    translationStatus: varchar("translation_status", { length: 50 }).default("untranslated").notNull(), // untranslated, partial, translated
    stringCount: integer("string_count").default(0).notNull(),
    lastExtractedAt: timestamp("last_extracted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("pages_project_id_idx").on(table.projectId),
    uniqueIndex("pages_project_url_idx").on(table.projectId, table.urlPath),
  ]
);

// 6. Source Strings (Normalized and deduplicated by SHA-256 hash)
export const sourceStrings = pgTable(
  "source_strings",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    contentHash: varchar("content_hash", { length: 64 }).notNull(), // sha256(trimmed source text)
    sourceText: text("source_text").notNull(),
    wordCount: integer("word_count").default(0).notNull(),
    contextHint: varchar("context_hint", { length: 100 }), // e.g. "button", "heading-1", "paragraph"
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("source_strings_project_id_idx").on(table.projectId),
    uniqueIndex("source_strings_hash_idx").on(table.projectId, table.contentHash),
  ]
);

// 7. Page-to-String Junction (Many-to-many relationship)
export const pageStrings = pgTable(
  "page_strings",
  {
    id: serial("id").primaryKey(),
    pageId: integer("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    stringId: integer("string_id")
      .notNull()
      .references(() => sourceStrings.id, { onDelete: "cascade" }),
    domSelector: text("dom_selector"), // CSS selector hint for widget replacement
    occurrenceIndex: integer("occurrence_index").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("page_strings_page_id_idx").on(table.pageId),
    index("page_strings_string_id_idx").on(table.stringId),
  ]
);

// 8. Translations (Target language translations)
export const translations = pgTable(
  "translations",
  {
    id: serial("id").primaryKey(),
    stringId: integer("string_id")
      .notNull()
      .references(() => sourceStrings.id, { onDelete: "cascade" }),
    targetLanguage: varchar("target_language", { length: 10 }).notNull(),
    translatedText: text("translated_text").notNull(),
    status: varchar("status", { length: 50 }).default("draft").notNull(), // draft, approved, rejected
    modelVersion: varchar("model_version", { length: 50 }).default("ct2-int8-1.0").notNull(),
    isReviewed: boolean("is_reviewed").default(false).notNull(),
    reviewedBy: integer("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("translations_string_id_idx").on(table.stringId),
    uniqueIndex("translations_unique_pair_idx").on(table.stringId, table.targetLanguage),
  ]
);

// 9. Translation Jobs (Tracking asynchronous or batch jobs)
export const translationJobs = pgTable(
  "translation_jobs",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    pageId: integer("page_id").references(() => pages.id, { onDelete: "set null" }),
    targetLanguage: varchar("target_language", { length: 10 }).notNull(),
    status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, in_progress, completed, failed
    totalStrings: integer("total_strings").default(0).notNull(),
    completedStrings: integer("completed_strings").default(0).notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("translation_jobs_project_id_idx").on(table.projectId),
  ]
);

// 10. Glossary Entries (Terminology constraints)
export const glossaryEntries = pgTable(
  "glossary_entries",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceTerm: varchar("source_term", { length: 255 }).notNull(),
    targetTerm: varchar("target_term", { length: 255 }).notNull(),
    targetLanguage: varchar("target_language", { length: 10 }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("glossary_project_id_idx").on(table.projectId),
    uniqueIndex("glossary_term_pair_idx").on(table.projectId, table.sourceTerm, table.targetLanguage),
  ]
);

// 11. Installation Tokens
export const installationTokens = pgTable(
  "installation_tokens",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 64 }).notNull().unique(),
    domainWhitelist: jsonb("domain_whitelist").$type<string[]>().default([]).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("tokens_token_idx").on(table.token),
  ]
);

// 12. Audit Events
export const auditEvents = pgTable(
  "audit_events",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    projectId: integer("project_id").references(() => projects.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 100 }).notNull(), // project_created, page_extracted, translation_approved, etc.
    details: jsonb("details").$type<Record<string, unknown>>().default({}).notNull(),
    ipAddress: varchar("ip_address", { length: 45 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_events_project_id_idx").on(table.projectId),
  ]
);

// 13. User Translation Memory (per-user, private)
export const userTranslationMemory = pgTable(
  "user_translation_memory",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceHash: varchar("source_hash", { length: 64 }).notNull(),
    sourceLang: varchar("source_lang", { length: 10 }).notNull(),
    targetLang: varchar("target_lang", { length: 10 }).notNull(),
    sourceText: text("source_text").notNull(),
    translatedText: text("translated_text").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("utm_user_id_idx").on(table.userId),
    uniqueIndex("utm_user_pair_idx").on(table.userId, table.sourceHash, table.sourceLang, table.targetLang),
  ]
);

// 14. Shared Translation Memory (public testing data, available to all users)
export const sharedTranslationMemory = pgTable(
  "shared_translation_memory",
  {
    id: serial("id").primaryKey(),
    sourceHash: varchar("source_hash", { length: 64 }).notNull(),
    sourceLang: varchar("source_lang", { length: 10 }).notNull(),
    targetLang: varchar("target_lang", { length: 10 }).notNull(),
    sourceText: text("source_text").notNull(),
    translatedText: text("translated_text").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("stm_pair_idx").on(table.sourceHash, table.sourceLang, table.targetLang),
  ]
);

// 15. Usage Statistics
export const usageStatistics = pgTable(
  "usage_statistics",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    date: varchar("date", { length: 10 }).notNull(), // "YYYY-MM-DD"
    pageViews: integer("page_views").default(0).notNull(),
    translatedChars: integer("translated_chars").default(0).notNull(),
    widgetRequests: integer("widget_requests").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("usage_project_date_idx").on(table.projectId, table.date),
  ]
);

// Define Drizzle Relations for clean queries
export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  auditEvents: many(auditEvents),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, {
    fields: [projects.userId],
    references: [users.id],
  }),
  domains: many(projectDomains),
  pages: many(pages),
  sourceStrings: many(sourceStrings),
  translationJobs: many(translationJobs),
  glossaryEntries: many(glossaryEntries),
  tokens: many(installationTokens),
  auditEvents: many(auditEvents),
  usageStats: many(usageStatistics),
}));

export const pagesRelations = relations(pages, ({ one, many }) => ({
  project: one(projects, {
    fields: [pages.projectId],
    references: [projects.id],
  }),
  pageStrings: many(pageStrings),
}));

export const sourceStringsRelations = relations(sourceStrings, ({ one, many }) => ({
  project: one(projects, {
    fields: [sourceStrings.projectId],
    references: [projects.id],
  }),
  pageStrings: many(pageStrings),
  translations: many(translations),
}));

export const pageStringsRelations = relations(pageStrings, ({ one }) => ({
  page: one(pages, {
    fields: [pageStrings.pageId],
    references: [pages.id],
  }),
  string: one(sourceStrings, {
    fields: [pageStrings.stringId],
    references: [sourceStrings.id],
  }),
}));

export const translationsRelations = relations(translations, ({ one }) => ({
  sourceString: one(sourceStrings, {
    fields: [translations.stringId],
    references: [sourceStrings.id],
  }),
  reviewer: one(users, {
    fields: [translations.reviewedBy],
    references: [users.id],
  }),
}));
