# WebLingo — website translation with your own LibreTranslate

WebLingo extracts the visible text of a website, translates it with a
self-hosted [LibreTranslate](https://github.com/LibreTranslate/LibreTranslate)
server, and gives you a one-line `<script>` that adds a language switcher to the
site. Visitors pick a language and the page is translated in place, including
right-to-left layout for Arabic, Urdu, Hebrew and Persian.

## How it works

```
Dashboard (Next.js on Netlify)                 Your LibreTranslate server
  URL ─► SSRF-safe fetch ─► HTML parser            (Python, your VPS)
         ─► unique segments (SHA-256) ─► Postgres         ▲
  Job steps (~7 s each) ─► translation memory ─► batch ───┘
         ─► approved translations ─► Postgres

Visitor's browser (your website)
  <script src=".../widget.js" data-project-key="wl_..."> 
     ─► GET /api/widget/config        (languages with approved translations)
     ─► GET /api/widget/translations  (hash → translation, cached 60 s)
     ─► swaps text in place, keeps links/markup, restores the original on English
```

| Part | Where | What it does |
| --- | --- | --- |
| `src/lib/extractor.ts` | server | Safe fetching (SSRF checks on every redirect, 5 MB / 6 s limits) and HTML parsing into segments |
| `src/lib/segments.ts` | server | Segment rules shared with the widget |
| `src/lib/engine-manager.ts` | server | LibreTranslate client: language validation, batching, retries with backoff, translation memory |
| `src/lib/pipeline.ts` | server | Stores pages/strings in bulk and runs translation jobs in time-boxed steps |
| `public/widget.js` | visitor browser | Language switcher (Shadow DOM), DOM translation, MutationObserver, restore |
| `src/components/QuickTranslateBar.tsx` | dashboard | URL → language → progress → results → install script |

### Segments

A page is split into **segments**: each run of text inside a block element
(heading, paragraph, list item, button, table cell…), plus visible attributes
(`alt`, `title`, `placeholder`, `aria-label`, button values) and the `<title>`.
Inline elements inside a sentence become numbered placeholders, so
`Read our <a href="/privacy">privacy policy</a>` is stored as
`Read our <g1>privacy policy</g1>`. LibreTranslate translates it with the
placeholders in place, and the widget rebuilds the sentence using the
**original** `<a>` element, so links, classes and event handlers survive.
Translations that lose a placeholder are rejected and reported as failed.

Not translated: `script`, `style`, `code`, `pre`, `textarea`, `select`, comments,
`hidden`/`display:none` elements, and anything with `translate="no"`, the
`notranslate` class, or `data-no-translate`.

Identical text is translated once per project and reused on every page;
translation memory also reuses it across projects.

## Run locally

Requirements: Node.js 20+, PostgreSQL, a reachable LibreTranslate server.

```bash
npm install
cp .env.example .env        # set DATABASE_URL, JWT_SECRET, LIBRETRANSLATE_URL
npm run db:push             # create tables
npm run db:seed             # optional demo data
npm run dev                 # http://localhost:3000
```

Check connectivity at `http://localhost:3000/api/health` (database and
LibreTranslate status).

If you used a WebLingo version from before November 2026, remove the fake
`[ES] text` placeholder translations it stored:

```bash
npm run db:purge-fallbacks          # dry run: shows counts
npm run db:purge-fallbacks -- --yes # delete them
```

## Tests

```bash
npm run test:extract                       # extractor unit tests (offline)
node tests/integration.mjs                 # end-to-end API test (needs dev server + LibreTranslate)
node tests/serve-fixtures.mjs <projectKey> # serve the test site on :8090 with the widget installed
```

See [TESTING.md](TESTING.md) for the latest test report.

## Deploy to Netlify

1. Push the repository to GitHub and import it in Netlify. `netlify.toml`
   already sets the build (`npm run build`) and the Next.js runtime.
2. Create a Postgres database reachable from the internet (Neon works well) and
   run `npm run db:push` once against it.
3. In **Site configuration → Environment variables** set:
   - `DATABASE_URL`: your database URL
   - `JWT_SECRET`: 32+ random characters
   - `LIBRETRANSLATE_URL`: e.g. `http://117.102.7.15:8089`
   - `NEXT_PUBLIC_APP_URL`: your Netlify URL, e.g. `https://weblingo.netlify.app`
   - optionally `LIBRETRANSLATE_API_KEY`, `REQUIRE_AUTH=true`, `WIDGET_REQUIRE_DOMAINS=true`
4. Deploy, then open `https://YOUR-SITE/api/health`; it must report
   `"database": true` and `"online": true`.

Netlify limits each request to 10 seconds by default. WebLingo is built for
that: every request does a bounded amount of work, and the dashboard advances
translation jobs step by step. Nothing needs a background worker. LibreTranslate
cannot run on Netlify; keep it on your own server. See [DEPLOYMENT.md](DEPLOYMENT.md).

## Install the widget on a website

1. In the dashboard, translate the site's pages (or the whole site).
2. Click **Authorize <host>** (or add the domain on the project page).
3. Paste the generated script into the `<head>` of every page:

```html
<script
  src="https://YOUR-WEBLINGO-DOMAIN/widget.js"
  data-project-key="wl_your_project_key"
  data-default-language="en"
  defer></script>
```

Optional attributes:

| Attribute | Default | Meaning |
| --- | --- | --- |
| `data-languages` | all translated | Comma-separated subset, e.g. `es,ar,ur` |
| `data-default-language` | none | Language to show visitors who have not chosen one |
| `data-position` | `bottom-right` | `bottom-left`, `top-right`, `top-left` |
| `data-accent` | `#2563eb` | Button colour |
| `data-theme` | `auto` | `light`, `dark`, `auto` |
| `data-observe` | `true` | Translate content added later by JavaScript |
| `data-report-missing` | `true` | Report untranslated text seen on the live page to the dashboard |
| `data-instant` | `true` | Fill text that has no approved translation with Chrome's on-device translator (desktop Chrome, HTTPS pages) |
| `data-debug` | `true` | Log every widget action to the browser console (errors are always logged) |

The chosen language is remembered across pages. JavaScript API:
`WebLingo.setLanguage("ar")`, `WebLingo.getLanguage()`.

## Faster translation with Chrome's built-in translator

Chrome's right-click **Translate** is Google Translate inside the browser;
websites cannot call it. Desktop Chrome 138+ also ships the
[Translator API](https://developer.chrome.com/docs/ai/translator-api): a free
translator that runs on the computer itself and that web pages *can* use.
WebLingo uses it in two places, always with LibreTranslate as the fallback:

| Where | What happens | Fallback |
| --- | --- | --- |
| Dashboard, Engine "Chrome on this computer first" (default) | Pending strings are translated in your Chrome, checked by the server (not empty, links kept) and saved like any other translation (`POST /api/jobs/:id/claim`, `POST /api/jobs/:id/results`) | Languages Chrome doesn't offer, strings where it drops a link, or no answer within 4 s go to LibreTranslate |
| Widget on the client's site | Text with no approved translation is translated on the visitor's computer when they switch language | Other browsers, phones and plain-HTTP sites keep the original text for those items |

Requirements and limits: HTTPS pages only (the dashboard on Netlify qualifies;
a site on plain `http://` does not), and a one-time model download per language,
which Chrome only starts right after a click. Instant widget translations are
not reviewed or saved; they are still reported so they can be translated and
approved in the dashboard.

The project key is a **public** identifier, like a publishable key: it only
reads approved translations. No LibreTranslate address or secret is ever sent
to visitors. Sites with a Content-Security-Policy must allow your WebLingo
domain in `script-src` and `connect-src`.

## Limitations

- **Translation quality and speed are LibreTranslate's.** Your server measured
  about 2–4 short strings per second; a 1,000-string site takes a few minutes the
  first time and seconds afterwards (cached). Review important pages in the
  translation editor; mark brand names with `translate="no"`.
- **JavaScript-rendered sites** (React/Vue apps that ship an empty HTML shell)
  have little text in their HTML. The dashboard warns about this. Once the widget
  is installed, it reports the text it sees on real visits, and the next
  "Translate all" in the editor translates it. A headless browser is not used
  because it does not fit within Netlify's function limits.
- **Sites that block bots** (HTTP 403/429, CAPTCHA pages) cannot be fetched; the
  error is reported. Paste the page HTML instead, or install the widget and let
  it report text.
- The dashboard is single-owner unless `REQUIRE_AUTH=true`.
