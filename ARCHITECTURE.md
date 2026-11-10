# WebLingo — System Architecture Document

## 1. High-Level System Architecture

WebLingo separates translation authoring and storage from visitor-facing widget delivery. The system consists of three distinct modules:

```
+-----------------------------------------------------------------------------------+
|                                  WEBLINGO PLATFORM                                |
|                                                                                   |
|  +---------------------+    +-------------------------+    +-------------------+  |
|  |  Website Owner /    |    |  Extraction Service     |    |  Admin Dashboard  |  |
|  |  Admin UI           |    |  - SSRF-safe HTTP Fetch |    |  - Project Mgmt   |  |
|  |  (Next.js / PHP)    |    |  - DOM Tree Parser      |    |  - String Editor  |  |
|  |                     |    |  - Content Hasher       |    |  - Approval Queue |  |
|  +----------+----------+    +------------+------------+    +---------+---------+  |
|             |                            |                           |            |
|             +----------------------------+---------------------------+            |
|                                          |                                        |
|                          +---------------+---------------+                        |
|                          |   PostgreSQL / MySQL Store    |                        |
|                          |   - Projects & Domains        |                        |
|                          |   - Strings & Translations    |                        |
|                          |   - Translation Jobs & Cache  |                        |
|                          +---------------+---------------+                        |
|                                          |                                        |
+------------------------------------------|----------------------------------------+
                                           |
       +-----------------------------------+-----------------------------------+
       | Private Network / Token Auth                                          | Public HTTPS
       v                                                                       v
+-------------------------------+                             +---------------------------------+
|   TRANSLATION ENGINE SERVICE  |                             |   CLIENT WEBSITE + WIDGET       |
|   (Python 3.11 + Argos/CT2)   |                             |   <script src=".../widget.js">  |
|                               |                             |                                 |
|  - REST Engine API            |                             |  - Reads Approved Dictionaries  |
|  - Dynamic Model Downloader   |                             |  - In-Place DOM Text Swapping   |
|  - CTranslate2 Batch Worker   |                             |  - RTL Layout Auto-Switching    |
|  - Caching & Hash Lookup      |                             |  - No Direct Python API Calls   |
+-------------------------------+                             +---------------------------------+
```

---

## 2. Core Components

### Component A: Web Management Platform
- **Responsibilities:**
  - User authentication and multi-tenant project isolation.
  - Project configuration (source language, enabled target languages, allowed domains).
  - Webpage URL extraction orchestrator.
  - Interactive translation review editor (side-by-side source and translated text).
  - Translation approval gate (only approved strings are published to the public API).
  - Project status, statistics, and embed code generation.

### Component B: Text Extraction Engine
- **Responsibilities:**
  - Performs safe URL resolution and HTTP GET requests.
  - **SSRF Protection:** Validates hostname DNS before fetching. Rejects IP ranges:
    - Loopback: `127.0.0.0/8`, `::1`
    - Private networks: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
    - Cloud metadata: `169.254.169.254`
    - Carrier-grade NAT and link-local addresses.
  - Parses DOM structure, selectively targeting readable content elements (`<h1>`–`<h6>`, `<p>`, `<a>`, `<button>`, `<li>`, `<td>`, `label`, `span`).
  - Ignores code, script, style, SVG, noscript, input hidden, and elements with `data-no-translate` or `translate="no"`.
  - Computes a deterministic SHA-256 hash of normalized text for deduplication.

### Component C: Open-Source Translation Service
- **Responsibilities:**
  - Microservice running on Python with Argos Translate / CTranslate2.
  - Endpoints:
    - `GET /health` — engine status, CPU/RAM, loaded models.
    - `GET /languages` — available source-target language pairs.
    - `POST /translate` — batch translation of normalized strings.
  - Secret token validation via `X-Engine-Secret` header.
  - Model caching and warm worker pools to avoid cold model load penalties.

### Component D: Visitor Translation Widget (`widget.js`)
- **Responsibilities:**
  - Lightweight (<12 KB minified), zero external JavaScript dependencies.
  - Configured with `data-project="PROJECT_ID"` and `data-api="https://YOUR_WEBLINGO_API"`.
  - Checks client domain against project's allowed domain list.
  - Fetches approved translations for the active page URL and language.
  - Attaches floating or embedded language switcher dropdown.
  - Replaces text nodes cleanly without breaking event listeners or destroying DOM nodes.
  - Automatically toggles `dir="rtl"` and `lang="ar|ur"` on `<html>` or `<body>` when switching to RTL languages.

---

## 3. Data Flow

### 1. Project Creation & Extraction Flow
1. User enters website project: `https://example.com`, Source: `English`, Targets: `[Spanish, Arabic, Urdu]`.
2. User submits page URL: `https://example.com/about`.
3. Extraction worker validates URL against SSRF rules, downloads HTML, strips non-translatable tags, and segments visible text blocks.
4. Extracted strings are hashed (`sha256(trimmed_text)`) and saved to `source_strings` table.

### 2. Translation & Review Flow
1. User clicks "Translate Page" or "Translate Project".
2. System checks `translations` table:
   - If string hash + target language already has an approved translation, it is immediately linked.
   - If untranslated, strings are batched and dispatched to the Python Translation Service.
3. Python service runs CTranslate2 inference and returns translated text.
4. Translations are saved with status `draft`.
5. User reviews translations in the side-by-side dashboard, edits if desired, and clicks "Approve".

### 3. Website Visitor Delivery Flow
1. Visitor opens `https://example.com/about`.
2. Embedded `widget.js` runs asynchronously.
3. Widget reads user's preferred language (from `localStorage` or browser default).
4. If a non-source language is chosen, widget queries `/api/widget/v1/translations?project=ID&url=...&lang=ar`.
5. API returns dictionary of approved hashes and translations with HTTP `Cache-Control: public, max-age=3600`.
6. Widget matches DOM elements by text hash / selector and updates visible text nodes, setting document `dir="rtl"` if Arabic or Urdu.

---

## 4. Security Architecture

1. **Strict SSRF Mitigation:**
   - Pre-fetch DNS resolution with IP address validation.
   - Disallow non-HTTP(S) protocols (block `file://`, `gopher://`, `ftp://`).
   - Limit response size to 5 MB per page.
   - 10-second connection timeout.
2. **Access Control & Multi-Tenancy:**
   - Every database query for projects, pages, strings, or translations is scoped to `user_id`.
   - Cross-project access is blocked at the ORM/query level.
3. **Widget Domain Enforcement:**
   - Public translation endpoint verifies the HTTP `Origin` or `Referer` header against the project's registered domains.
4. **No Third-Party Cloud Data Leakage:**
   - All translation payloads stay on the internal host network.
   - No customer website content is ever sent to Google, OpenAI, DeepL, or external cloud APIs.
