# WebLingo — Testing Log and Verification Suite

## Phase 0: Feasibility Log
- Test 001: Environment specs verified (Debian 12, Node.js 22, Python 3.11, PostgreSQL 15).
- Test 002: Argos repository inspected (100 packages, 49 English source pairs).
- Status: PASS

---

## Phase 1: Translation Microservice Tests
- Test 101: `GET /health` responding with `status: healthy` and `zero_paid_api: true`.
- Test 102: Token authentication enforcement (`X-Engine-Secret`).
- Test 103: Catalog discovery with RTL flags for Arabic (`ar`) and Urdu (`ur`).
- Test 104: English to Spanish batch translation.
- Test 105: English to Arabic RTL translation with native Arabic Unicode.
- Test 106: English to Urdu RTL translation with native Nastaliq Unicode.
- Test 107: Edge cases (empty array, identity, oversize).
- Test 108: Mock provider test.
- Status: PASS (8 / 8 tests passed)

---

## Phase 2: Application Foundation & Database Schema Tests

### Test 201: Drizzle Schema Migration Push
- **Command:** `npx drizzle-kit push`
- **Result:** Successfully created all 13 tables, foreign keys, unique indexes, and constraints in PostgreSQL:
  - `users`, `projects`, `project_domains`, `supported_languages`, `pages`, `source_strings`, `page_strings`, `translations`, `translation_jobs`, `glossary_entries`, `installation_tokens`, `audit_events`, `usage_statistics`.
- **Status:** PASS

### Test 202: Portable MySQL/MariaDB Schema Generation
- **Artifact:** `migrations/mysql_schema.sql`
- **Result:** Generated valid MySQL syntax with utf8mb4 encoding, foreign keys, and indexes for cPanel compatibility.
- **Status:** PASS

### Test 203: Database Seeding & Relation Integrity
- **Command:** `node --env-file=.env node_modules/.bin/tsx src/db/run-seed.ts`
- **Result:**
  - 12 supported languages seeded.
  - 1 demo user created with crypto.scrypt password hash (`demo12345`).
  - 1 demo project ("Apex Global Technology") seeded with API key.
  - 4 pages (`/`, `/about`, `/services`, `/contact`) created.
  - 6 source strings with deterministic SHA-256 hashes created.
  - 6 translations in Spanish, Arabic (RTL), and Urdu (RTL) seeded in `approved` and `draft` statuses.
- **Status:** PASS

### Test 204: Dashboard Query Aggregations
- **Check:** `getDashboardOverview()` calculates real database aggregates with zero fake mock numbers.
- **Result:**
  - `totalProjects`: 1
  - `totalPages`: 4
  - `totalStrings`: 6
  - `approvedTranslations`: 4
  - `draftTranslations`: 2
  - `untranslatedStrings`: 12
  - `progressPercent`: 28%
- **Status:** PASS

---

## Final Validation Sequence
- `npx next typegen` ➔ PASS
- `npm exec tsc -- --noEmit` ➔ PASS (0 errors)
- `npm run build` ➔ PASS
- `build_and_start` ➔ PASS
