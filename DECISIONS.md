# WebLingo — Architectural Decision Records (ADRs)

## ADR 001: Choice of Translation Engine
- **Date:** 2026-10-26
- **Status:** Approved
- **Context:** The prompt requires website translation without paid API fees (e.g. Google Translate or DeepL). The solution must run on self-hosted infrastructure and support critical target languages including Arabic and Urdu.
- **Decision:** Select **Argos Translate** powered by **CTranslate2** as the core translation engine.
- **Rationale:** 
  1. CTranslate2 runs 8-bit quantized OpenNMT models, achieving ~150-280ms CPU inference per sentence.
  2. Model files are compact (~60MB - 85MB per language pair), compared to OPUS-MT / Hugging Face transformers which require 300MB - 600MB per pair.
  3. Memory footprint during inference is <1GB RSS with multiple models active, allowing operation on modest 2GB-4GB VPS instances.
  4. Fully open-source (MIT license) with no per-request fees or third-party data transmission.

---

## ADR 002: Service Separation (Web Platform vs Engine Daemon)
- **Date:** 2026-10-26
- **Status:** Approved
- **Context:** Shared web hosting (e.g., standard cPanel) does not support persistent C++ neural inference daemons or high memory reservations.
- **Decision:** Decouple the web management platform and widget delivery API from the Python translation engine microservice.
- **Rationale:**
  1. The Web Management platform can be deployed anywhere (Next.js container, PHP/Apache cPanel server, or Node.js server).
  2. The Python translation service runs on a dedicated VPS or container, communicating with the web platform over an authenticated REST API (`X-Engine-Secret`).
  3. The website translation widget never communicates directly with the Python service; it only fetches approved translations cached by the web platform.
  4. If the translation service is temporarily offline or busy, web visitor widgets are unaffected because translations are pre-rendered and stored in the database.

---

## ADR 003: Environment Alignment and Dual Backend Strategy
- **Date:** 2026-10-26
- **Status:** Approved
- **Context:** The active sandbox environment is equipped with Node.js 22, Next.js 16, React 19, and PostgreSQL 15, while the prompt mentions PHP 8 / MySQL cPanel deployment as an intended deployment target.
- **Decision:** Implement the interactive fullstack WebLingo application on Next.js + PostgreSQL (using Drizzle ORM) for the live preview platform, while maintaining 100% modular backend API contracts and providing complete PHP 8.x / MySQL PDO reference implementation scripts, database schemas, and migration guides in the repository.
- **Rationale:**
  1. Satisfies the platform healthcheck and live interactive preview requirement.
  2. Ensures clean REST API specifications that can be implemented interchangeably in PHP 8 / MySQL and Next.js / PostgreSQL.
  3. Adheres to the prompt requirement: "Keep the PHP application and Python translation service modular. The PHP application must not depend directly on LibreTranslate-specific code."

---

## ADR 004: Deduplication and Hash-Based String Storage
- **Date:** 2026-10-26
- **Status:** Approved
- **Context:** Websites repeat common UI strings (e.g. "Home", "Contact Us", "Submit", footer links) across dozens or hundreds of pages. Re-translating them wastes compute and leads to translation inconsistencies.
- **Decision:** Extract text at the block/phrase level, trim and normalize whitespace, and compute a deterministic SHA-256 hash `hash = sha256(normalized_text)`.
- **Rationale:**
  1. Identical strings across different pages share a single source record and translation.
  2. Translating a repeated header or footer string on one page automatically translates it on all pages in the project.
  3. Page-to-string mappings are represented in a many-to-many relationship table (`page_strings`).

---

## ADR 005: Two-Stage Translation Lifecycle (Draft vs Approved)
- **Date:** 2026-10-26
- **Status:** Approved
- **Context:** Machine translations may occasionally contain phrasing inaccuracies, gender mismatches, or translation of brand names.
- **Decision:** All machine-generated translations are initially assigned the status `draft`. Only after an owner reviews and marks them as `approved` are they delivered by the public widget API. An optional "auto-publish" project setting will allow direct approval for low-risk testing.
- **Rationale:**
  1. Protects website owners from embarrassing machine translation errors.
  2. Gives users full agency to refine copy before it appears to public visitors.

---

## ADR 006: Strict Non-Inclusion of Paid APIs
- **Date:** 2026-10-26
- **Status:** Approved
- **Context:** Cost surprises and dependency on paid services must be strictly prevented.
- **Decision:** The codebase contains zero integrations with Google Translate API, DeepL Pro API, AWS Translate, or OpenAI translation endpoints. No paid fallback logic exists. If the local/self-hosted engine fails, the job transitions to `failed` and prompts the user to retry or manually translate.
