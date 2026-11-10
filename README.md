# WebLingo — Website Translation Platform

> **WebLingo** is a self-hosted website translation platform that empowers website owners to translate their sites into multiple languages (including Arabic and Urdu) without relying on recurring commercial translation APIs (e.g. Google Cloud Translate, DeepL Pro).

---

## Interactive Live Demo

- **Admin Dashboard & Management Hub:** `/`
  - Real PostgreSQL metrics (Projects, Pages, Strings, Approved Translations, Coverage progress bar).
  - Safe Webpage Extraction Studio with SSRF protection.
  - Side-by-Side Translation Review & Approval Editor.
  - Glossary & Terminology Rule Manager.
  - Live Translation Engine Playground with unlimited text chunking.
  - Embeddable Widget Snippet Generator with copy-to-clipboard.
- **Simulated Customer Website:** `/client-demo`
  - Realistic corporate website ("Apex Global Technology") with the WebLingo snippet installed.
  - Real-time in-place DOM translation without page reloads.
  - Seamless Right-to-Left (RTL) flipping for Arabic (`ar`) and Urdu (`ur`).

---

## Core Technologies & Architecture

- **Web Platform:** Next.js (App Router), React 19, TypeScript, Tailwind CSS.
- **Database:** PostgreSQL 15 via Drizzle ORM (with 13 normalized tables).
- **cPanel / PHP Reference:** Complete MySQL/MariaDB schema in `migrations/mysql_schema.sql`.
- **Translation Engine:** Pure in-process open-source engine with:
  - Curated high-precision domain dictionary for website UI and navigation.
  - Open-source translation memory integration (MyMemory Open TM API).
  - Multi-paragraph and long-text auto-chunking (splitting across `.`, `!`, `?`, `\n`).
  - Strict zero-paid-API policy: zero Google, DeepL, or AWS API keys.
- **Extraction Engine:** SSRF-protected parser with deterministic SHA-256 string hashing for cross-page deduplication.
- **Visitor Widget:** Standalone `<script src="/widget.js">` (<8 KB, zero dependencies).

## Run locally

The app requires a PostgreSQL database on the computer running the server. Start PostgreSQL, create a database named `weblingo`, copy `.env.example` to `.env`, and set `DATABASE_URL` to that database and `JWT_SECRET` to a private random value. Then run:

```bash
npm install
npm run db:push
npm run db:seed
npm run dev
```

If PostgreSQL is not running or `DATABASE_URL` is wrong, the app's dashboard and API routes that use stored data cannot load. The health endpoint checks database connectivity. Visitors opening a shared link use the database configured on the server host; they do not need PostgreSQL installed on their own device.

When extracting a website hosted on a private LAN address, add that exact `host:port` to `EXTRACTION_ALLOWED_PRIVATE_HOSTS` in `.env` (for example, `192.168.0.229:3000`) and restart the server. Private addresses stay blocked by default, and the extractor still blocks loopback and cloud metadata addresses. Avoid setting `ALLOW_PRIVATE_IPS=true` on a server shared with untrusted users because that allows extraction from any private network address.

## Sharing a local server

Start the app with `npm run dev`. Next.js listens on all network interfaces and prints both a local URL and a `Network` URL. Send the `Network` URL (for example, `http://192.168.1.25:3000`) to someone connected to the same Wi-Fi or LAN. Do not send `http://localhost:3000` or `http://127.0.0.1:3000`; those addresses point to the recipient's own computer.

If the other device cannot connect, allow Node.js or TCP port 3000 through the host computer's firewall, and confirm both devices are on the same network. A local server URL is not reachable by someone on a different network or over the public internet. For that, deploy the app or use a secure public tunnel; keep the app's database and secrets on the server and do not expose PostgreSQL directly.

The same network binding is used by `npm start` for a production build. These commands make the app reachable on the host's network; they do not create a public internet URL.

---

## Quick Start (Local)

Prerequisites: Node.js 18+, and ONE of:
  - PostgreSQL 15+ running locally, OR
  - Docker Desktop (recommended — zero manual DB setup).

### Option A — Docker (easiest, works on any PC)
```bash
docker compose up -d          # starts Postgres (and LibreTranslate with --profile translate)
npm install
npm run setup                 # creates schema + seed data
npm run dev                   # http://localhost:3000
```

### Option B — Native PostgreSQL
```bash
# 1. Install Node.js 18+ and PostgreSQL 15+
# 2. Make sure Postgres is running and you know the password
npm install
# Edit .env if your Postgres password differs from the default
npm run setup
npm run dev
```

# (Optional) Neural MT backend for better translation quality:
# pip install libretranslate
# libretranslate --host 0.0.0.0 --port 5000
```

Default login: `demo@weblingo.local` / `demo12345`

---

## Test Verification Suite

Run the comprehensive end-to-end test suite:
```bash
./tests/test_full_platform.sh
```

Tests performed:
1. Healthcheck (`GET /api/health`)
2. Long-text auto-chunking (>600 characters)
3. Arabic RTL translation & character validation
4. Urdu RTL translation & character validation
5. HTML content extraction & SHA-256 deduplication
6. SSRF security (blocks `169.254.169.254` and `127.0.0.1`)
7. Public widget delivery API (`GET /api/widget/translations`)
8. Simulated customer website loading and widget embed (`GET /client-demo`)
