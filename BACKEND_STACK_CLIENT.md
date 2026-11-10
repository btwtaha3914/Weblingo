# WebLingo Translation Platform — Backend Stack Overview

**A detailed guide to how the backend works — including the specific frameworks, libraries, and technical mechanisms used**

---

## 1. What Is WebLingo?

WebLingo is a self-hosted website translation platform. It lets a website owner:

1. Add their website URL to the system
2. Extract all readable text from that page (headings, paragraphs, buttons, links, etc.)

## 2. Backend Stack at a Glance

| Layer | Technology | Technical Details |
|-------|-----------|-------------------|
| **Framework** | Next.js 16 (App Router) | Server-side React framework; handles pages, API routes, and server-side rendering |
| **Language** | TypeScript | Type-safe JavaScript; compiles to plain JS for Node.js runtime |
| **Database** | PostgreSQL | Relational database storing users, projects, pages, text, and translations |
| **Database Tool** | Drizzle ORM | TypeScript ORM that connects Node.js to PostgreSQL and runs typed SQL queries |
| **Authentication** | Custom JWT (JSON Web Tokens) | HMAC-SHA256 signed tokens stored in `httpOnly` cookies (`weblingo_session`) |
| **Fetching (HTTP)** | Node.js `fetch` API | Built-in Next.js/Node.js fetch; uses `AbortController` for 10s timeout, manual redirect handling (up to 5 hops), custom `User-Agent` header |
| **Translation Engine** | In-process TypeScript engine (`engine-manager.ts`) | Curated phrase dictionary + MyMemory Open TM API fallback + SHA-256 text hashing for deduplication + in-memory `Map` cache |
| **Web Extractor** | DOM Parser + `TreeWalker` | Parses HTML and walks text nodes (`NodeFilter.SHOW_TEXT`) to extract translatable strings |

## 3. How the Backend Works — Step by Step

### Step A: User Signs Up or Logs In (Authentication)
- **Framework:** Next.js API route (`/api/auth`)
- **Password security:** Passwords are hashed using `crypto.scryptSync` with a random 16-byte salt and 64-byte derived key; stored as `salt:hash`
- **Session:** On successful login, a JSON Web Token (JWT) is created using HMAC-SHA256 signing. The token contains `{ id, email, fullName, role, exp }` and is set as an `httpOnly` cookie (`weblingo_session`) valid for 72 hours
- **Verification:** `GET /api/auth` reads the cookie or `Authorization: Bearer` header, verifies the JWT signature and expiry, and returns `{ authenticated, user }`

### Step B: Create a Translation Project
- **Framework:** Next.js API route (`POST /api/projects`)
- **API Key generation:** A unique key is generated as `wl_` + `crypto.randomBytes(24).toString("hex")` (e.g., `wl_14c3f825e24c519222fda4008780a12cbb5e141ce8a1762d`)
- **Project storage:** Saved to PostgreSQL `projects` table via Drizzle ORM
- **Domain allowlist:** The website's hostname is extracted from `baseUrl` and inserted into `project_domains` table with `isVerified = true`
- **Installation token:** A `wl_tok_` + random bytes token is created for widget embed authorization

### Step C: Extract Text from a Webpage (Fetching + Parsing)
- **Framework:** Next.js API route (`POST /api/extract` or `/api/translate-page`)
- **Fetching:** Uses Node.js `fetch` API with:
  - `AbortController` for a 10-second timeout
  - Manual redirect handling (follows up to 5 redirects, re-validating each hop for SSRF safety)
  - Custom `User-Agent` and `Accept` headers to mimic a real browser
- **SSRF Protection:** `validateSafeUrl()` blocks loopback (`127.0.0.0/8`), private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local, multicast, and IPv6 unique-local addresses. Private IPs are only allowed if listed in `EXTRACTION_ALLOWED_PRIVATE_HOSTS`

### Step D: Translate the Text (Translation Engine)
- **Framework:** In-process TypeScript engine (`src/lib/engine-manager.ts`)
- **Dictionary lookup:** First checks a curated `CURATED_DICTIONARY` of common website phrases (Welcome, About, Contact, Privacy Policy, etc.) for `es`, `ar`, `ur`, `fr`, `de`, `it`
- **Network fallback:** Queries the public MyMemory Open TM API when no dictionary match exists
- **Offline fallback:** Returns a placeholder format (`[ES: text]` or `[es] text`) if all translation sources fail
- **Chunking:** Long texts (>350 characters) are split into natural sentence/paragraph chunks, translated in parallel batches of 3, then reassembled
- **Caching:** `IN_MEMORY_CACHE` Map stores results keyed by `sourceLang->targetLang:text` for repeat lookups
- **RTL support:** Arabic (`ar`) and Urdu (`ur`) are flagged as right-to-left languages
- **Storage:** Translations are inserted into the `translations` table with status `approved` (if `autoApprove=true`) or `draft`

### Step E: Generate the Widget Snippet (Script Generation)
- **Framework:** Next.js React components (`QuickTranslateBar.tsx`, `WidgetEmbedModal.tsx`, `WidgetSnippetCard.tsx`)
- **Template:** The script tag is generated using JavaScript template literals:
  ```html
  <script src="http://YOUR-SERVER/widget.js" data-project-key="wl_your_unique_key" data-api-url="http://YOUR-SERVER" async></script>
  ```
- **URL source:** Uses `NEXT_PUBLIC_APP_URL` environment variable (e.g., `http://192.168.0.229:3000`) instead of `window.location.origin`, so the snippet works when pasted on any client website
- **Console command:** A one-line JavaScript command is also generated for testing via browser DevTools Console:
  ```js
  const s = document.createElement("script"); s.src = "http://YOUR-SERVER/widget.js"; s.setAttribute("data-project-key", "wl_..."); document.head.appendChild(s);
  ```

### Step F: Visitor Switches Languages on the Client Website (Widget Execution)
- **Framework:** Vanilla JavaScript IIFE (`public/widget.js`)
- **Loading:** The widget script loads and reads `data-project-key` from the `<script>` tag (or `document.currentScript`)
- **API resolution:** Determines the backend URL from `data-api-url`, then script `src` origin, then `window.location.origin`
- **UI injection:** `injectWidgetUI()` creates a fixed bottom-right floating container (`#weblingo-widget-container`) with a globe icon, `<select>` language dropdown, and status message
- **Translation request:** When a visitor picks a language, `applyLanguage(targetLang)` calls:
  ```js
  fetch(`${apiBase}/api/widget/translations?key=${projectKey}&lang=${targetLang}`, { cache: "no-store" })
  ```
- **Backend response:** `GET /api/widget/translations` verifies the API key, checks the request `Origin`/`Referer` against `project_domains` (returns HTTP 403 if unauthorized), joins `sourceStrings` → `translations` where `status = "approved"`, and returns a dictionary `{ contentHash: translatedText }` with CORS headers (`Access-Control-Allow-Origin: *`) and `Cache-Control: no-store`

## 4. Database — What Is Stored

All data lives in PostgreSQL, accessed via Drizzle ORM. Here are the main tables in simple terms:

| Table | Stores |
|-------|--------|
| **Users** | Accounts (email, hashed password, name, role) |
| **Projects** | Each website project (name, URL, target languages, unique API key) |
| **Project Domains** | Which websites are allowed to use the widget for each project |
| **Pages** | Which pages were extracted (URL, title, how many text pieces found) |
| **Source Strings** | The original English text pieces extracted from pages |
| **Translations** | The translated versions (Spanish, Arabic, Urdu, etc.) + approval status |
| **Page Strings** | Links each text piece to the page it came from |

## 5. Security Features

| Protection | How It Works |
|------------|--------------|
| **Passwords never stored in plain text** | Passwords are scrambled with `crypto.scryptSync` (cryptographic hash + random salt) |
| **Secure sessions** | Login tokens are signed JWTs (HMAC-SHA256), stored as `httpOnly` cookies, expire after 72 hours |
| **Widget domain lock** | The widget only returns translations if the visitor's website domain is in the project's `project_domains` Allowlist; otherwise returns HTTP 403 |
| **Safe webpage fetching** | `validateSafeUrl()` blocks private/internal IP addresses (home networks, office networks) to prevent Server-Side Request Forgery (SSRF) attacks |

## 6. Simple Data Flow

```
Client Website Owner
        │
        ▼
[ Enters website URL in WebLingo dashboard ]
        │
        ▼
Backend creates Project + API Key (Next.js + Drizzle ORM + PostgreSQL)
        │
        ▼
[ Enters a page URL to translate ]
        │
        ▼
Backend fetches page (Node.js fetch + SSRF check) → extracts text (DOM TreeWalker) → saves to DB
        │
        ▼
Backend auto-translates text (in-process TS engine + dictionary + MyMemory fallback) → saves translations to DB
        │
        ▼
[ Owner copies widget script snippet ]
        │
        ▼
[ Owner pastes script into their website <head> ]
        │
        ▼
Visitor opens client website → widget.js loads (vanilla JS IIFE)
        │
        ▼
Visitor picks language → widget asks backend for translations (fetch with cache: no-store)
        │
        ▼
Backend verifies domain + API key → sends translation dictionary (GET /api/widget/translations)
        │
        ▼

## 7. What the Client Needs to Do

1. **Provide their website URL** so a project can be created
2. **Copy the widget script snippet** from the dashboard
3. **Paste the script** into their website's `<head>` section (or just before `</body>`)
4. **Authorize their domain** in the dashboard (one click) so the widget is allowed to serve translations on their site
5. Visitors can then switch languages instantly

## 8. Demo Credentials (Pre-seeded for Testing)

| Project | Website | API Key | Languages |
|---------|---------|---------|-----------|
| Apex Global Technology | `demo.weblingo.local` | `wl_live_demo_key_77889900aabbccdd` | Spanish, Arabic, Urdu, French, German |
| Global Tech | `globaltechcorporation.com` | `wl_14c3f825e24c519222fda4008780a12cbb5e141ce8a1762d` | Spanish, Arabic, Urdu, French |

## 9. Summary for Non-Technical Stakeholders

- **No monthly per-word fees.** The translation engine runs on your own server
- **Fast.** Translations are pre-computed and stored, so visitors see them instantly
- **Secure.** Only your authorized domain can request translations. Passwords and sessions are encrypted
- **Multilingual ready.** Includes Arabic and Urdu with automatic right-to-left layout support
- **Lightweight.** The widget on your site is under 10 KB and does not slow down page loading

---

**End of document.** This explains how the WebLingo backend works from signup to live translation on a visitor's browser.

Widget replaces text on the page instantly (TreeWalker + SHA-256 hash matching)
```

| **File size limits** | Webpages larger than 5 MB are rejected |
| **Request timeouts** | Fetching a webpage times out after 10 seconds via `AbortController` so the system never hangs |

| **Glossary Entries** | Custom terms the client wants translated a specific way |
| **Audit Events** | Log of actions (who created what, when translations were approved) |
| **Usage Statistics** | How many page views and translation requests each project gets |

- **DOM application:** The widget uses `document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)` to walk all text nodes, computes `sha256(normalizedText)` via `crypto.subtle.digest("SHA-256")` (with pure-JS SHA-256 fallback), and replaces matching nodes with translations
- **RTL:** Sets `document.documentElement.dir = "rtl"` for Arabic/Urdu, `"ltr"` otherwise
- **Restore:** Original text is preserved in an `originalNodes` Map so switching back to English restores the page exactly

- **Size limit:** HTML responses larger than 5 MB are rejected
- **Parsing:** `extractTranslatableText()` scans the DOM and collects text from `h1`–`h6`, `p`, `a`, `button`, `li`, `th`, `td`, `label`, `span`, and `title`
- **Exclusions:** Ignores `script`, `style`, `noscript`, `svg`, `code`, `pre`, `iframe`, elements with `data-no-translate` or `translate="no"`, and content inside the widget container
- **Deduplication:** Each text string is normalized (trimmed + whitespace collapsed) and hashed with SHA-256 via `hashSourceText()` to avoid storing duplicates

| **Client Widget** | Vanilla JavaScript (`public/widget.js`) | Zero-dependency IIFE script; <10 KB; loads via `<script>` tag on client websites |
| **Environment** | `.env` + `NEXT_PUBLIC_APP_URL` | Runtime config for database URL, JWT secret, cookie settings, and public server URL |

3. Automatically translate that text into multiple languages (Spanish, Arabic, Urdu, French, German, etc.)
4. Approve the translations
5. Embed a tiny JavaScript widget on their website
6. Let their visitors switch languages instantly with a floating language selector

No paid translation APIs (like Google or DeepL) are used. Everything runs on your own server using an open-source translation engine.
