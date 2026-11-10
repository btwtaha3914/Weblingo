# WebLingo Translation Platform — Technical Architecture

**Version:** 1.0  
**Platform:** Next.js 16 + PostgreSQL + Drizzle ORM  
**Target:** Zero-paid-API website localization with native RTL (Arabic/Urdu) support

---

## 1. System Overview

WebLingo is a self-hosted website translation platform. A site owner creates a project, extracts translatable text from a webpage URL, auto-translates it into target languages, and then embeds a lightweight JavaScript widget (`widget.js`) into their site's `<head>`. Visitors to the site can then switch languages via a floating selector, and the widget applies pre-approved translations to the page DOM in real time.

### Core Components

| Component | Location | Responsibility |
|-----------|----------|----------------|

## 2. Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router, `next dev` / `next start`) |
| Language | TypeScript |
| Database | PostgreSQL |
| ORM | Drizzle ORM (`drizzle-orm`, `drizzle-kit`) |
| Auth | Custom JWT (HMAC-SHA256 signed, base64url payload) |
| Styling | Tailwind CSS v4 |

## 3. Directory Structure

```
weblingo-translation-platform/
├── public/
│   └── widget.js                 # Client-side embeddable translation widget
├── scripts/
│   └── start_engine.sh           # Helper to start Python translation engine (optional)
├── service/
│   └── engine.py                 # Standalone Python translation HTTP server (port 5005)
├── src/
│   ├── app/
│   │   ├── page.tsx              # Landing page
│   │   ├── layout.tsx            # Root layout
│   │   ├── globals.css           # Global styles
│   │   ├── client-demo/page.tsx  # Simulated demo website (Apex Global Technology)
│   │   ├── login/page.tsx        # Login page
│   │   ├── signup/page.tsx       # Signup page
│   │   ├── projects/page.tsx     # Project list dashboard
│   │   ├── projects/[id]/page.tsx # Project workspace
│   │   └── api/
│   │       ├── auth/route.ts          # Login / Register / Logout / Session check
│   │       ├── projects/route.ts      # Create / List projects
│   │       ├── projects/[id]/route.ts # Get / Update / Delete a project
│   │       ├── extract/route.ts       # Fetch URL + extract translatable strings
│   │       ├── translate-page/route.ts# Extract + auto-translate + store
│   │       ├── translate/route.ts     # Translate / approve strings (batch)
│   │       ├── translations/route.ts  # CRUD for translations
│   │       ├── widget/translations/route.ts # Widget translation dictionary endpoint
│   │       ├── health/route.ts        # Health check
│   │       ├── glossary/route.ts      # Glossary management
│   │       └── reset-database/route.ts# Dev utility: reset DB
│   ├── components/
│   │   ├── QuickTranslateBar.tsx      # Translate any URL + generate embed snippet
│   │   ├── WidgetEmbedModal.tsx       # Copy widget snippet modal
│   │   ├── WidgetSnippetCard.tsx      # Embeddable snippet display card
│   │   ├── TranslationEditor.tsx      # Edit / approve translations
│   │   ├── TranslationPlayground.tsx  # Test translations
│   │   ├── ExtractionStudio.tsx       # Extraction preview
│   │   ├── GlossaryManager.tsx        # Glossary CRUD
│   │   ├── Navbar.tsx / Footer.tsx    # Layout chrome
│   │   └── ...
│   ├── db/
│   │   ├── schema.ts          # Drizzle table definitions
│   │   ├── index.ts           # Pool + drizzle instance
│   │   ├── seed.ts            # Seed data
│   │   └── ...
│   ├── lib/
│   │   ├── auth.ts            # Password hashing, JWT create/verify, hashSourceText
│   │   ├── db-queries.ts      # Dashboard + project query helpers
│   │   ├── engine-manager.ts  # Translation engine (chunking, dictionary, cache)
│   │   └── extractor.ts       # SSRF-safe URL fetch + DOM text extraction
├── migrations/
│   └── mysql_schema.sql       # MySQL-compatible schema dump (for cPanel/PHPMyAdmin)
├── .env                       # Runtime environment (NEXT_PUBLIC_APP_URL, DATABASE_URL, JWT_SECRET)
├── .env.example               # Template
├── package.json
├── next.config.ts
├── tsconfig.json

## 4. Database Schema

All tables are defined in `src/db/schema.ts` using Drizzle ORM (PostgreSQL). A MySQL-compatible dump exists at `migrations/mysql_schema.sql`.

### 4.1 Users
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| email | varchar(255) UNIQUE NOT NULL | |
| passwordHash | text NOT NULL | `salt:scryptHex` |
| fullName | varchar(255) NOT NULL | |
| role | varchar(50) DEFAULT 'owner' | owner / editor / reviewer |
| createdAt, updatedAt | timestamp | |

### 4.2 Projects
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| userId | integer FK → users.id | |
| name | varchar(255) NOT NULL | |
| baseUrl | text NOT NULL | Website base URL |
| sourceLanguage | varchar(10) DEFAULT 'en' | |
| targetLanguages | jsonb DEFAULT `["es","ar","ur"]` | Array of language codes |
| isAutoPublish | boolean DEFAULT false | |
| apiKey | varchar(64) UNIQUE NOT NULL | `wl_` + 48 hex chars — used by widget |
| createdAt, updatedAt | timestamp | |

### 4.3 Project Domains (Widget Authorization)
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| projectId | integer FK → projects.id | |
| domain | varchar(255) NOT NULL | Allowed origin for widget requests |
| isVerified | boolean DEFAULT false | |
| createdAt | timestamp | |

### 4.4 Supported Languages
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| code | varchar(10) UNIQUE NOT NULL | en, es, ar, ur, fr, de, it |
| name | varchar(100) NOT NULL | |
| nativeName | varchar(100) NOT NULL | |
| isRtl | boolean DEFAULT false | |
| isInstalled | boolean DEFAULT true | |

### 4.5 Pages
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| projectId | integer FK → projects.id | |
| urlPath | text NOT NULL | Extracted page URL |
| title | varchar(255) DEFAULT 'Untitled Page' | |
| extractionStatus | varchar(50) | pending / extracted |
| translationStatus | varchar(50) | untranslated / translated / partial |
| stringCount | int DEFAULT 0 | |
| lastExtractedAt | timestamp NULL | |

### 4.6 Source Strings
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| projectId | integer FK → projects.id | |
| contentHash | text | SHA-256 of normalized source text (dedup key) |
| sourceText | text | Original English text |
| wordCount | integer | |
| contextHint | text | e.g. "title", "h1", "button" |
| createdAt | timestamp | |

### 4.7 Page Strings (join table)
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| pageId | integer FK → pages.id | |
| stringId | integer FK → sourceStrings.id | |
| domSelector | text | CSS selector of the element |
| occurrenceIndex | integer | Position on the page |

### 4.8 Translations
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| stringId | integer FK → sourceStrings.id | |
| targetLanguage | varchar(10) | es, ar, ur, ... |
| translatedText | text | |
| status | varchar(50) DEFAULT 'pending' | pending / draft / approved |
| isReviewed | boolean DEFAULT false | |
| reviewedAt | timestamp NULL | |
| modelVersion | text | Engine version used |
| reviewedBy | integer FK → users.id | |

### 4.9 Translation Jobs
Batch job tracking (total_strings, completed_strings, error_message).

### 4.10 Glossary Entries
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| projectId | integer FK → projects.id | |
| sourceTerm | varchar(255) | |
| targetTerm | varchar(255) | |
| targetLanguage | varchar(10) | |
| notes | text | |

### 4.11 Installation Tokens
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| projectId | integer FK → projects.id | |
| token | varchar(64) UNIQUE | `wl_tok_` + 40 hex chars |
| domainWhitelist | jsonb | Array of allowed domains |
| isActive | boolean DEFAULT true | |
| expiresAt | timestamp NULL | |

### 4.12 Audit Events
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| userId | integer FK → users.id (nullable) | |

## 5. Step-by-Step System Flow

### Step 1 — User Registration & Login
1. User visits `/signup` or `/login`.
2. `POST /api/auth` with `{ action: "register"|"login", email, password, fullName? }`.
3. Password is hashed with `crypto.scryptSync` (random 16-byte salt, 64-byte derived key) → stored as `salt:hash`.
4. On success, a signed JWT session token is created (`createSessionToken`) containing `{ id, email, fullName, role, exp }` and set as an `httpOnly` cookie `weblingo_session` (72h, SameSite=lax).
5. `GET /api/auth` validates the cookie / `Authorization: Bearer` header and returns `{ authenticated, user }`.

### Step 2 — Project Creation
1. User opens the Projects dashboard (`/projects`) and fills the **Create Project** modal: website `name` and `baseUrl`.
2. `POST /api/projects` creates a row in `projects` with:
   - `apiKey = "wl_" + crypto.randomBytes(24).toString("hex")` (e.g. `wl_14c3f825...`)
   - `targetLanguages = ["es","ar","ur"]` by default
   - `userId = 1` (demo owner fallback)
3. The project's hostname (from `baseUrl`) is inserted into `projectDomains` with `isVerified = true`.
4. An `installationTokens` row is created (`wl_tok_` + random bytes) with `domainWhitelist`.

### Step 3 — URL Extraction & Text Parsing
1. User enters a webpage URL in **QuickTranslateBar** (`/` page) and clicks **Translate Webpage**.
2. `POST /api/translate-page` (or `/api/extract`) receives `{ url, projectId, targetLanguage, autoTranslate, autoApprove }`.
3. `validateSafeUrl(url)` runs SSRF protection:
   - Parses the URL.
   - Blocks loopback (`127.0.0.0/8`, `::1`), link-local (`169.254.0.0/16`), private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`), multicast (`224.0.0.0/4`), and IPv6 unique-local (`fc00::/7`).
   - Private IPs are allowed only if listed in `EXTRACTION_ALLOWED_PRIVATE_HOSTS`.
   - Follows up to 5 redirects, re-validating each hop.
4. `fetchAndExtractPage(url)` fetches the HTML (10s timeout, browser-like User-Agent, max 5 MB).
5. `extractTranslatableText(html, url)` parses the DOM and collects text nodes from:

### Step 4 — Auto-Translation & Storage
1. Extracted strings are upserted into `sourceStrings` (keyed by `projectId + contentHash`).
2. Each string is linked to the page via `pageStrings`.
3. If `autoTranslate` is true, `translateBatch` (`engine-manager.ts`) translates all source texts into `targetLanguage`:
   - Checks the curated `CURATED_DICTIONARY` first (exact matches for common UI strings).
   - Falls back to MyMemory Open TM API (network).
   - Falls back to a placeholder format (`[ES: text]` or `[es] text`) if offline.
   - Long texts are split into natural chunks (<350 chars) and reassembled.
4. Translations are inserted into `translations` with `status = "approved"` when `autoApprove = true`, otherwise `"draft"`.
5. The project's `targetLanguages` array is updated to include the new language.
6. An audit event `page_auto_translated` is recorded.

### Step 5 — Widget Embed & Client-Side Injection
1. After translation, `QuickTranslateBar` displays the embed snippet:
   ```html
   <script src="http://192.168.0.229:3000/widget.js" data-project-key="wl_...." data-api-url="http://192.168.0.229:3000" async></script>
   ```
   *(`NEXT_PUBLIC_APP_URL` is used instead of `window.location.origin` so the snippet works when pasted on the client's site.)*
2. The site owner pastes this `<script>` into their website's `<head>` or `<body>`.
3. When the client's page loads, `widget.js` executes:
   - Reads `data-project-key` from the script tag (or `document.currentScript`).
   - Resolves `apiBase` from `data-api-url`, then script `src` origin, then `window.location.origin`.
   - Aborts with a console warning if no `projectKey`.
   - Calls `injectWidgetUI()` on `DOMContentLoaded` (or immediately if ready).

### Step 6 — Language Switching & Translation Application
1. The widget builds a floating bottom-right container (`#weblingo-widget-container`) with:
   - A globe icon (🌐)
   - A `<select>` populated with supported languages (`en`, `es`, `fr`, `de`, `ar`, `ur`)
   - A status message span
2. User picks a target language → `applyLanguage(targetLang)` runs:
   - If `targetLang === "en"`: restores all original text nodes from `originalNodes` map, resets `dir="ltr"` and `lang="en"`.
   - Otherwise: `fetch(`${apiBase}/api/widget/translations?key=${projectKey}&lang=${targetLang}`, { cache: "no-store" })`.
3. The server endpoint `GET /api/widget/translations`:
   - Looks up the project by `apiKey`.
   - **Domain authorization:** checks the request `Origin` / `Referer` against `projectDomains`. If domains exist and the origin is not allowed → **HTTP 403** `Domain '...' is not authorized for this project.`
   - Joins `sourceStrings` → `translations` where `targetLanguage = lang` and `status = "approved"`.
   - Builds a dictionary `{ contentHash: translatedText }`.
   - Returns `{ ok, project, sourceLanguage, targetLanguage, isRtl, translationsCount, dictionary }` with `Access-Control-Allow-Origin: *` and `Cache-Control: no-store`.
4. Back in the browser, `applyLanguage`:
   - Sets `document.documentElement.dir` to `"rtl"` for Arabic/Urdu, else `"ltr"`.
   - Sets `document.documentElement.lang = targetLang`.
   - Walks all text nodes in `document.body` via `TreeWalker` (excluding script/style/widget container).

## 6. API Reference

### 6.1 Authentication — `POST /api/auth`
Body: `{ action: "login"|"register"|"logout", email, password, fullName? }`  
Response: `{ ok, user, token }` + sets `weblingo_session` cookie.

### 6.2 Session Check — `GET /api/auth`
Headers: `Cookie: weblingo_session=<token>` or `Authorization: Bearer <token>`  
Response: `{ authenticated: boolean, user: object|null }`.

### 6.3 Projects — `GET /api/projects`
Response: `{ ok, projects: [] }`.

### 6.4 Create Project — `POST /api/projects`
Body: `{ name, baseUrl, targetLanguages?: string[], allowedDomains?: string[] }`  
Response: `{ ok, project, token }`.

### 6.5 Project Detail — `GET /api/projects/:id` | `PUT` | `DELETE`
Returns project, pages, domains, and string stats.

### 6.6 Extract — `POST /api/extract`
Body: `{ url?, html?, projectId?, saveToDatabase? }`  
Returns extracted strings without translating.

### 6.7 Translate Page — `POST /api/translate-page`
Body: `{ url, projectId, targetLanguage, autoTranslate, autoApprove }`  
Full extract + translate + store pipeline.

## 7. Widget.js Deep Dive (`public/widget.js`)

- **Size:** ~10.8 KB, zero external dependencies.
- **Entry:** IIFE that runs on load.
- **Configuration:** Read from `data-project-key` and optional `data-api-url` on the script tag.
- **Languages:** English, Spanish, French, German, Arabic (RTL), Urdu (RTL).
- **Hashing:** Uses native `crypto.subtle.digest("SHA-256")` with a pure-JS SHA-256 fallback (`sha256Fallback`) for older browsers.
- **UI:** Fixed bottom-right rounded pill (`z-index: 999999`), dark slate theme.
- **DOM walk:** `document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, …)` excludes script/style/noscript/svg/code/pre and the widget's own container.
- **Translation storage:** `originalNodes` Map preserves original `nodeValue` so switching back to English restores the page exactly.
- **Network:** Fetches `/api/widget/translations?key=&lang=` with `cache: "no-store"` so approved edits appear immediately.

## 8. Translation Engine (`src/lib/engine-manager.ts`)

- Runs entirely in-process inside Next.js (no external daemon required).
- **Curated dictionary:** Hard-coded high-quality translations for common website strings (home, about, services, contact, privacy, welcome, etc.) for `es`, `ar`, `ur`, `fr`, `de`, `it`.
- **MyMemory fallback:** Queries the public MyMemory Open TM API when the dictionary has no match.

## 9. Security Model

| Threat | Mitigation |
|--------|------------|
| SSRF (extracting internal IPs) | `validateSafeUrl` blocks private/loopback/multicast; allowlist via `EXTRACTION_ALLOWED_PRIVATE_HOSTS`; redirect re-validation |
| Widget data leakage | `/api/widget/translations` checks `Origin`/`Referer` against `projectDomains`; returns 403 for unauthorized origins |
| Password exposure | `scrypt` with unique random salt; never stored plaintext |
| Session hijacking | JWT HMAC-SHA256 signed; `httpOnly` cookie; 72h expiry; base64url |

## 10. Environment Variables (`.env`)

| Variable | Example | Purpose |
|----------|---------|---------|
| `NODE_ENV` | `development` | Runtime mode |
| `APP_URL` | `http://localhost:3000` | Internal app URL |
| `NEXT_PUBLIC_APP_URL` | `http://192.168.0.229:3000` | **Public URL used in generated widget snippets** (must be reachable by end clients) |
| `DATABASE_URL` | `postgresql://postgres:taha1234@localhost:5432/weblingo` | PostgreSQL connection string |
| `JWT_SECRET` | `Complicated@77889900112233445566` | Signing key for session tokens |
| `SESSION_COOKIE_NAME` | `weblingo_session` | Cookie name |
| `COOKIE_SECURE` | `false` | Set `true` in production (HTTPS) |
| `TRANSLATION_ENGINE_URL` | `http://127.0.0.1:5005` | Optional external Python engine |
| `TRANSLATION_ENGINE_SECRET` | `generate_internal_service_secret_token` | Engine auth |
| `TRANSLATION_TIMEOUT_MS` | `15000` | Translation request timeout |
| `TRANSLATION_MAX_BATCH_SIZE` | `25` | Max texts per batch |
| `EXTRACTION_TIMEOUT_MS` | `10000` | Page fetch timeout |
| `EXTRACTION_MAX_SIZE_BYTES` | `5242880` | 5 MB HTML limit |
| `ALLOW_PRIVATE_IPS` | `false` | Block private IPs by default |

## 11. Commands

```bash
# Install
npm install

# Dev server (port 3000)
npm run dev

# Typecheck
npm run typecheck

# Build
npm run build

# Start production
npm start


## 12. Known Limitations & Future Improvements

1. **Partial extraction:** The extractor only captures text from a fixed set of tags (`h1`–`h6`, `p`, `a`, `button`, `li`, `th`, `td`, `label`, `span`). Text inside custom components, shadow DOM, or dynamically rendered content may be missed.
2. **Single-page extraction:** Only the exact URL entered is extracted; linked sub-pages are not crawled automatically.
3. **Translation quality:** Falls back to dictionary / MyMemory / placeholder format. No paid neural MT (Google/DeepL/AWS) by design.
4. **Widget scope:** Translates static text nodes present at load time. Content injected later by SPA frameworks (React/Vue/Angular routers) will not be re-translated automatically unless `applyLanguage` is re-invoked.
5. **Domain authorization:** The client's production domain must be added via the **Authorize** flow before the widget returns translations on that domain.

## 13. Demo Credentials (Pre-seeded)

| Project | Name | API Key | Languages | Base URL |
|---------|------|---------|-----------|----------|
| 1 | Apex Global Technology | `wl_live_demo_key_77889900aabbccdd` | es, ar, ur, fr, de | `https://demo.weblingo.local` |
| 8 | Global Tech | `wl_14c3f825e24c519222fda4008780a12cbb5e141ce8a1762d` | es, ar, ur, fr | `https://www.globaltechcorporation.com/` |

---

**End of document.** This file describes the complete runtime behavior of WebLingo from signup to live widget translation on a visitor's site.

# Database
npm run db:push        # Push schema to DB
npm run db:seed        # Seed demo data
npm run db:clear       # Clear all data

# Lint
npm run lint
```

| `LIBRETRANSLATE_URL` | `http://127.0.0.1:5000` | Optional self-hosted LibreTranslate |
| `EXTRACTION_ALLOWED_PRIVATE_HOSTS` | `192.168.0.229:3000` | Comma-separated allowlist for private hosts |

| CORS abuse | Widget endpoint sets `Access-Control-Allow-Origin: *` but only returns non-sensitive translation dictionaries |
| Large payload DoS | 5 MB HTML response limit; 10s fetch timeout |

- **Offline fallback:** Returns `[TARGET: text]` or `[target] text` so the UI never breaks.
- **Chunking:** Texts longer than 350 chars are split at sentence/paragraph boundaries, translated in parallel batches of 3, and rejoined.
- **Cache:** `IN_MEMORY_CACHE` Map keyed by `src->tgt:text` for repeat lookups.
- **RTL set:** `ar`, `ur`, `he`, `fa`, `ps`, `sd`, `ug`, `yi`.


### 6.8 Translations — `GET /api/translations?projectId=&targetLang=`
Returns all strings with their translations for a project.

### 6.9 Update / Approve Translation — `POST /api/translations`
Body: `{ action: "update"|"approve", stringId, targetLanguage, translatedText }`.

### 6.10 Widget Dictionary — `GET /api/widget/translations?key=&lang=`
**Public endpoint used by `widget.js`.** Returns `{ dictionary, isRtl, translationsCount }`. Enforces CORS + domain authorization.

### 6.11 Health — `GET /api/health`
Response: `{ ok: true }`.

   - For each node, computes `sha256(normalizedText)` and looks it up in the dictionary.
   - If matched, replaces `node.nodeValue` with the translation.
   - Reports status: "Translated N text items" or "No page text matched…".

   - `h1`–`h6`, `p`, `a`, `button`, `li`, `th`, `td`, `label`, `span`, `title`
   - Excludes: `script`, `style`, `noscript`, `svg`, `code`, `pre`, `iframe`, elements with `data-no-translate` or `translate="no"`, and anything inside `#weblingo-widget-container`.
6. Each string is normalized (`trim` + collapse whitespace) and hashed with `hashSourceText` (SHA-256) for deduplication.
7. Result: `{ url, title, stringCount, strings: [{ contentHash, sourceText, wordCount, contextHint, domSelector, occurrenceIndex }] }`.

| projectId | integer FK → projects.id | |
| eventType | varchar(100) | project_created, page_extracted, translation_approved, etc. |
| details | jsonb | |
| ipAddress | varchar(45) | |
| createdAt | timestamp | |

### 4.13 Usage Statistics
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| projectId | integer FK → projects.id | |
| date | varchar(10) | "YYYY-MM-DD" |
| pageViews | int DEFAULT 0 | |
| translatedChars | int DEFAULT 0 | |
| widgetRequests | int DEFAULT 0 | |

└── TECHNICAL_ARCHITECTURE.md  # This file
```
| Widget | Vanilla JavaScript (`public/widget.js`, <8 KB, zero dependencies) |
| Translation | In-process TS engine (`engine-manager.ts`) + optional LibreTranslate / MyMemory |

| Next.js Frontend / API Routes | `src/app/` | Pages, API routes, server-side rendering |
| Database Layer | `src/db/` | Drizzle schema, connection pool, queries |
| Translation Engine | `src/lib/engine-manager.ts` | In-process TS translation (dictionary + MyMemory fallback) |
| Webpage Extractor | `src/lib/extractor.ts` | Safe HTML fetching + translatable-text extraction |
| Client Widget | `public/widget.js` | Zero-dependency browser script that injects language switcher |
| Auth | `src/lib/auth.ts` + `src/app/api/auth/route.ts` | JWT session management (password hashing, verify) |
