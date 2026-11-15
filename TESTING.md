# Testing report — 2026-11-15

Environment: local dev server (Next.js 16, Windows), local PostgreSQL,
LibreTranslate at `http://117.102.7.15:8089` (50 languages, no API key).
The widget was tested in Chromium (desktop and 375×812 mobile emulation) on
the fixture site served from a different origin (`localhost:8090`) than WebLingo
(`localhost:3000`).

## How to re-run

```bash
npm run test:extract                       # 12 offline extractor tests
node tests/integration.mjs                 # end-to-end API test, prints a project key
node tests/serve-fixtures.mjs <projectKey> # then open http://localhost:8090/index.html
```

## Results

| # | Scenario | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Simple HTML website | PASS | Fixture `about.html`: 7 segments, all translated |
| 2 | Large website | PASS (extraction) | en.wikipedia.org article: 1,239 unique / 1,737 items in 344 ms. Full translation of that page not run (≈5 min at measured LibreTranslate speed) |
| 3 | Many paragraphs | PASS | demo `services.html`: 76 items, 70 unique, 67/67 translated to Urdu via the dashboard |
| 4 | Nested elements | PASS | `<h1>… <strong>grow</strong> …</h1>` and links inside paragraphs translated with markup kept (unit test + browser) |
| 5 | Navigation and footer | PASS | Nav links split into one segment each; footer translated |
| 6 | Forms and buttons | PASS | Labels, `placeholder`, submit `value`, buttons translated in the browser |
| 7 | Unicode text | PASS | `café, naïve, 東京, “quotes” &amp;` round-trips; widget SHA-256 equals WebCrypto SHA-256 |
| 8 | Spanish | PASS | 29/29 + 3/3 strings, widget switch verified |
| 9 | French | PASS | 29/29 + 3/3, switched via the UI |
| 10 | Urdu | PASS | 29/29 + 3/3; RTL applied |
| 11 | Arabic | PASS | 29/29 + 3/3; `dir="rtl"`, `lang="ar"` set and removed again on English |
| 12 | Dynamically added elements | PASS | Text added 1.5 s after load, and text added after switching, both translated (MutationObserver) |
| 13 | Repeated text | PASS | Duplicates stored once (`occurrences` counted); about page reused 3–4 strings from index |
| 14 | Translation failures | PASS (unit + code path) | Failed/markup-losing results are stored as `failed` with the original text, shown in red in the editor, never served to the widget. A real LibreTranslate outage was not simulated |
| 15 | Invalid URL | PASS | 422 "Invalid URL format" |
| 16 | Unreachable website | PASS | 422 "Unable to resolve website host …" |
| 17 | Website blocking automated requests | PASS | zillow.com → 422 "refused automated access (HTTP 403)"; amazon.com bot page → 0 text, flagged as client-rendered |
| 18 | Script on an external test website | PASS | Cross-origin fixture site: switcher appears, Shadow DOM keeps the host's `button{background:hotpink}` out, 33/33 page segments matched |
| 19 | Script on multiple pages | PASS | Language chosen on index carried over to about.html (localStorage) |
| 20 | Netlify production deployment | NOT RUN | Needs your Netlify account. `next build` succeeds locally; follow DEPLOYMENT.md and check `/api/health` |

Additional checks:

| Check | Result |
| --- | --- |
| Several languages at once (API): one extraction, one job per language (de, zh, hi) | PASS, 3 languages in 8 s |
| Several languages at once (dashboard): 7 languages selected on the demo contact page, per-language progress, result tabs | PASS, 7/7 languages complete, 0 failures |
| More than 10 languages, or only the source language, rejected | PASS |
| Project page pre-selects the project's languages; editor tabs follow project languages | PASS |
| Restore to English leaves the DOM byte-identical to the original | PASS |
| `translate="no"`, `.notranslate`, `<pre>`, comments untouched | PASS |
| Keyboard: arrows/Home/End/Enter/Escape in the language menu | PASS |
| Mobile 375 px: compact button, menu fits the screen | PASS |
| SSRF: `169.254.169.254`, `192.168.1.1` blocked | PASS |
| Widget API rejects an unauthorized `Origin` (403) | PASS |
| `/api/widget/missing`: rejects `<script>` and number-only strings, 403 for foreign origins | PASS |
| `/api/reset-database` without sign-in → 401 | PASS |
| Unsupported language (`xx`) → 400 listing installed languages | PASS |
| `npx tsc --noEmit`, `eslint`, `next build` | PASS |

## Measured performance

LibreTranslate on this server: ~0.25–0.5 s per short segment, and **parallel
requests do not increase throughput** (4×10 strings in parallel took the same
22 s as sequential). WebLingo therefore sends one batch at a time and avoids
re-translating anything already translated or in translation memory.

| Run | Before | After |
| --- | --- | --- |
| Fixture site, 4 languages × 2 pages, cold | — | 39 s |
| Same, translation memory warm | — | 7 s |
| Old engine on Netlify | every string → `[ES] text` placeholder after the first 3 s timeout | real translations, each request < 10 s |

## Known quality limits (LibreTranslate, not WebLingo)

Short UI labels can be translated literally (e.g. table cell "No" → French
"Numéro"; brand "Northwind Studio" → Urdu "شمالی فن‌لینڈ"). Use `translate="no"`
for brand names and fix individual strings in the translation editor.
