# Deployment

WebLingo has two parts that are deployed separately:

| Part | Runtime | Where |
| --- | --- | --- |
| WebLingo app (dashboard, APIs, `widget.js`) | Node.js / Next.js | Netlify (or any Node host) |
| LibreTranslate | Python | Your own server, e.g. `http://117.102.7.15:8089` |

## 1. LibreTranslate server

Already running at `117.102.7.15:8089`. Recommended hardening, because the
server currently accepts requests from anyone without a key (`keyRequired: false`):

- Put it behind HTTPS (Caddy or nginx) so text travels encrypted between Netlify
  and the server.
- Enable API keys (`libretranslate --api-keys`), create a key, and set
  `LIBRETRANSLATE_API_KEY` in Netlify. Otherwise anyone can use your server's CPU.
- Speed is CPU-bound: parallel requests do not increase throughput. More CPU
  cores (`--threads`), or a GPU build, make translation faster.
- Load only the languages you need (`--load-only en,es,fr,de,ar,ur,zh`) to save RAM.

See [LIBRETRANSLATE_DEPLOY.md](LIBRETRANSLATE_DEPLOY.md) for installation.

## 2. Database

Any internet-reachable PostgreSQL works; Neon's free tier is enough. Create the
tables once from your machine:

```bash
DATABASE_URL="postgresql://..." npm run db:push
```

## 3. Netlify

1. Import the Git repository in Netlify. Build settings come from `netlify.toml`.
2. Environment variables (Site configuration → Environment variables):

   | Variable | Example | Required |
   | --- | --- | --- |
   | `DATABASE_URL` | `postgresql://user:pass@ep-x.neon.tech/weblingo?sslmode=require` | yes |
   | `JWT_SECRET` | 64 random hex chars | yes |
   | `LIBRETRANSLATE_URL` | `http://117.102.7.15:8089` | yes |
   | `NEXT_PUBLIC_APP_URL` | `https://weblingo.netlify.app` | recommended |
   | `LIBRETRANSLATE_API_KEY` | key from your server | if keys enabled |
   | `REQUIRE_AUTH` | `true` | for multi-user use |
   | `WIDGET_REQUIRE_DOMAINS` | `true` | to lock the widget to listed domains |

   `NEXT_PUBLIC_APP_URL` is read at build time; redeploy after changing it.
3. Deploy, then verify:
   - `https://YOUR-SITE/api/health` → `{"ok":true,"database":true,...}`
   - `https://YOUR-SITE/widget.js` loads
   - Translate a page in the dashboard and install the snippet on a test site.

### Function time limits

Netlify ends synchronous function requests after 10 s (26 s on plans where it
can be raised). WebLingo keeps every request short:

- Extracting a page: one request per page, fetch limited to `EXTRACTION_TIMEOUT_MS` (6 s).
- Translating: `POST /api/jobs/:id` runs one step of at most `JOB_STEP_BUDGET_MS`
  (7 s), sized from the measured LibreTranslate speed. The dashboard calls it
  until the job is done and shows the real counts.
- A cancelled or interrupted job loses nothing: finished translations are saved,
  and the next run continues with the rest.

If your plan allows 26 s functions, raise `JOB_STEP_BUDGET_MS` to about `20000`
for fewer, larger steps.

## Other Node hosts (VPS)

```bash
npm ci && npm run build
NODE_ENV=production PORT=3000 npm start
```

Put it behind HTTPS (the widget must be served over HTTPS for HTTPS websites).
