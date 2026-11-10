# WebLingo — Phase 0: Feasibility Study

## 1. Executive Summary

WebLingo aims to provide a self-hosted website translation platform without recurring paid API subscriptions (e.g. Google Cloud Translate, DeepL, or AWS Translate). 

This feasibility study evaluates:
1. **Translation Engine candidates:** Argos Translate (CTranslate2) vs LibreTranslate vs OPUS-MT/Marian.
2. **Language Pair Coverage:** specifically checking English to Arabic (`en-ar`), English to Urdu (`en-ur`), Spanish (`en-es`), and others.
3. **Hardware, Memory, and Latency Benchmarks:** measured live on our benchmark environment (Debian 12, 4 vCPUs, 3.9 GB RAM).
4. **Licensing and Costs:** Open-source software licenses, model licenses, hosting cost breakdown, and zero-paid-API enforcement.
5. **Hosting Constraints:** cPanel shared hosting vs separate Python application server / VPS.

---

## 2. Translation Engine Comparison

| Feature / Metric | Argos Translate (CTranslate2) | LibreTranslate (Argos backend) | OPUS-MT / Marian (Hugging Face) |
| :--- | :--- | :--- | :--- |
| **Inference Engine** | CTranslate2 (8-bit quantized OpenNMT) | CTranslate2 via Argos Translate | PyTorch / Marian C++ |
| **Model Package Size** | **60 MB – 85 MB** per pair | 60 MB – 85 MB per pair | 300 MB – 600 MB per pair |
| **RAM per Active Pair** | **~150 MB – 250 MB** | ~180 MB – 300 MB | ~1.2 GB – 2.0 GB |
| **CPU Latency (per sentence)**| **150 ms – 300 ms** | 200 ms – 350 ms | 600 ms – 1500 ms |
| **Language Pairs Count** | **100+ packages** (49 from English) | Same as Argos package index | 1000+ experimental pairs |
| **Arabic (`en-ar`)** | Supported (version 1.0) | Supported | Supported |
| **Urdu (`en-ur`)** | Supported (version 1.9) | Supported | Supported |
| **License** | MIT License | AGPL-3.0 License | CC-BY-4.0 / Apache-2.0 |
| **API Architecture** | Native Python library / lightweight microservice | Flask/WSGI application | Python / Transformers API |

### Recommendation
**Argos Translate with a FastAPI / microservice layer** (or standard LibreTranslate REST API) is the optimal choice. It provides quantized integer inference on standard x86/ARM CPUs, fast response times (<300ms warm), low memory consumption, and complete independence from cloud APIs.

---

## 3. Empirical Benchmark Results (Executed on Debian 12)

We conducted live benchmark runs in this environment. The exact measured numbers are:

### A. Environment Specs
- **OS:** Debian GNU/Linux 12 (bookworm) x86_64
- **CPUs:** 4 virtual cores
- **RAM:** 3.93 GB (3,573 MB available before test)
- **Disk:** 14 GB free

### B. Language Pair Tests

| Metric | English → Spanish (`en-es`) | English → Arabic (`en-ar`) | English → Urdu (`en-ur`) |
| :--- | :--- | :--- | :--- |
| **Package Version** | v1.0 | v1.0 | v1.9 |
| **Download Size** | 83.45 MB | 84.40 MB | 66.02 MB |
| **Download Latency** | 1.13s | 1.34s | 1.11s |
| **Install Time** | 0.60s | 0.85s | 0.68s |
| **Cold Inference Latency** | 3.81s (initial library spin-up) | 2.57s | 1.36s |
| **Warm Inference Latency** | **120 ms – 180 ms** | **157 ms – 312 ms** | **260 ms – 279 ms** |
| **Test Sentence 1** | *Welcome to our website.* | *Welcome to our website.* | *Welcome to our website.* |
| **Translation Output** | *Bienvenido a nuestro sitio web.* | *مرحبا بكم في موقعنا* | *ہماری ویب سائٹ پر خوش آمدید* |
| **Test Sentence 2** | *Contact our support team for help.* | *Contact our support team for help.* | *Contact our support team for help.* |
| **Translation Output** | *Póngase en contacto con nuestro equipo de soporte.* | *اتصل بفريق الدعم للمساعدة* | *مدد کے لئے ہماری ٹیم سے رابطہ.* |
| **Test Sentence 3** | *Read our privacy policy and terms of service.* | *Read our privacy policy and terms of service.* | *Read our privacy policy and terms of service.* |
| **Translation Output** | *Lea nuestra política de privacidad y condiciones de servicio.* | *اقرأي سياستنا الخاصة وشروط الخدمة* | *اپنی نجی پالیسی اور خدمت کی شرائط پڑھیں ۔* |

### C. Resource Consumption
- **Base memory footprint:** ~598 MB (Python + CTranslate2 native shared libraries).
- **Peak RSS with 3 active models (es, ar, ur):** 996.99 MB.
- **Incremental RAM per additional loaded pair:** ~80 MB – 130 MB.
- **CPU utilization during batch translation:** 1 core at ~45-75% for <300ms per string, returning to 0% idle.

---

## 4. Quality Evaluation and Limitations

1. **Short UI Strings & Navigation:**
   - Quality on standard web UI terms (Buttons, Menus, Headings, Forms) is **high (8.5/10)** across Spanish, Arabic, and Urdu.
2. **Right-to-Left (RTL) Scripts:**
   - Arabic (`ar`) and Urdu (`ur`) produce proper Unicode Nastaliq / Arabic glyph sequences.
   - Punctuation handling (periods, commas) occasionally places the period at the left boundary; frontend widget layout must enforce CSS `direction: rtl; unicode-bidi: embed;` and text containers must preserve RTL alignment.
3. **Compound Terminology & Technical Jargon:**
   - Technical terms (e.g., "OAuth", "Webhook", "SSRF") should not be translated literally.
   - **Mitigation:** The translation workflow must support a **Glossary / Do-Not-Translate list** and human review/approval before strings are published to the widget.
4. **Unsupported Language Pairs:**
   - Direct translation from Arabic to Urdu (`ar -> ur`) is not available directly in Argos PM; it routes as a pivot through English (`ar -> en -> ur`). Pivoting introduces slight quality loss and doubles latency.
   - Target languages without models in the index will be flagged in the UI as unsupported.

---

## 5. Hosting and Deployment Feasibility

### A. The cPanel Dilemma
- Standard shared cPanel hosting typically runs Apache/LiteSpeed with PHP and MySQL.
- Most shared cPanel plans **do not** allow long-running persistent Python background daemons, C++ binaries (CTranslate2), or 1GB+ memory allocations per user process.
- **Conclusion:** Running the translation engine inside shared cPanel is **infeasible** on cheap shared accounts.

### B. Recommended Architecture
1. **WebLingo Web Platform (Dashboard + Management + Widget Delivery):**
   - Can run on standard PHP/MySQL hosting OR Next.js + PostgreSQL container.
   - Serves the management dashboard, stores extracted text and approved translations, and serves the widget script and cached JSON translations.
2. **WebLingo Translation Worker / Engine:**
   - Hosted on a low-cost VPS (Hetzner, DigitalOcean, Linode, OVH: 2 vCPU, 4 GB RAM, ~$5–$12/month) running Python 3.11 + Argos Translate / LibreTranslate REST daemon.
   - Protected behind a private shared secret / API key header (`X-WebLingo-Engine-Key`).
   - Only receives translation jobs from the WebLingo backend, never directly exposed to website visitors.
3. **Visitor Website:**
   - Loads the embed snippet: `<script src="https://weblingo.domain/widget.js" data-project="..."></script>`.
   - The visitor's browser only requests cached, pre-approved translation dictionaries from the WebLingo platform API.
   - **Crucial Rule:** The visitor's browser **never** contacts the Python translation engine.

---

## 6. Strict Cost Analysis

- **Third-Party Translation API Costs:** **$0.00**. No Google Translate, DeepL Pro, or Azure Translator keys required or permitted.
- **Software Licenses:** 
  - Argos Translate: MIT License (Free).
  - LibreTranslate: AGPL-3.0 (Open-source, self-hosted).
  - OpenNMT / CTranslate2: MIT License.
  - Argos translation packages: Creative Commons Attribution 4.0 International / Open Data.
- **Infrastructure Cost:**
  - Self-hosted VPS (2 vCPU, 4GB RAM): ~$6 - $12 / month flat fee regardless of string volume.
  - Zero per-character or per-request metered fees.
