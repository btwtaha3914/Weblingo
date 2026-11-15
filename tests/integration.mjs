/**
 * End-to-end API test against a running WebLingo server + LibreTranslate.
 *
 *   node tests/integration.mjs [apiUrl=http://localhost:3000] [langs=es,fr,ar,ur]
 *
 * Creates a project "Integration test <time>", translates the fixture pages
 * (sent as HTML, so no public site is needed), drives each job to completion,
 * checks the widget endpoints, and prints the project key for
 * tests/serve-fixtures.mjs. Exits non-zero on any failed check.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const api = (process.argv[2] || "http://localhost:3000").replace(/\/+$/, "");
const langs = (process.argv[3] || "es,fr,ar,ur").split(",");
const here = path.dirname(fileURLToPath(import.meta.url));
let failures = 0;

function check(name, cond, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!cond) failures++;
}

async function call(method, url, body, headers = {}) {
  const res = await fetch(api + url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  return { status: res.status, data };
}

async function runJob(id) {
  let job;
  let steps = 0;
  for (;;) {
    const r = await call("POST", `/api/jobs/${id}`, { autoApprove: true });
    if (r.status !== 200) throw new Error(`job step HTTP ${r.status}: ${r.data.error}`);
    job = r.data.job;
    steps++;
    if (["completed", "completed_with_errors", "failed"].includes(job.status)) return { job, steps };
    if (steps > 200) throw new Error("job did not finish");
  }
}

const started = Date.now();
const health = await call("GET", "/api/health");
check("health: database + LibreTranslate online", health.status === 200 && health.data.ok, JSON.stringify(health.data.translationEngine));

const proj = await call("POST", "/api/projects", {
  name: `Integration test ${new Date().toISOString().slice(0, 16)}`,
  baseUrl: "http://localhost:8090/",
  targetLanguages: langs,
});
check("create project", proj.status === 200, proj.data.error);
const project = proj.data.project;
console.log(`      project id=${project.id} key=${project.apiKey}`);

const pages = ["index.html", "about.html"];
for (const lang of langs) {
  for (const page of pages) {
    const html = await readFile(path.join(here, "fixtures", "site", page), "utf8");
    const t0 = Date.now();
    const r = await call("POST", "/api/translate-page", {
      projectId: project.id,
      targetLanguage: lang,
      url: `http://localhost:8090/${page}`,
      html,
    });
    if (r.status !== 200) {
      check(`translate-page ${page} → ${lang}`, false, r.data.error);
      continue;
    }
    const { job, steps } = await runJob(r.data.job.id);
    check(
      `translate ${page} → ${lang}`,
      job.status === "completed" && job.failed === 0,
      `${r.data.uniqueCount} unique, ${r.data.alreadyTranslated} reused, ${job.done}/${job.total} translated in ${steps} step(s), ${((Date.now() - t0) / 1000).toFixed(1)}s, status=${job.status}${job.lastError ? `, err=${job.lastError}` : ""}`
    );
  }
}

// Several languages in one request: one extraction, one job per language.
{
  const multi = ["de", "zh", "hi"];
  const t0 = Date.now();
  const r = await call("POST", "/api/translate-page", {
    projectId: project.id,
    targetLanguages: multi,
    url: "http://localhost:8090/about.html",
    html: await readFile(path.join(here, "fixtures", "site", "about.html"), "utf8"),
  });
  const ok = r.status === 200 && Array.isArray(r.data.jobs) && r.data.jobs.map((j) => j.targetLanguage).join() === multi.join();
  check("multi-language request creates one job per language", ok, ok ? r.data.jobs.map((j) => `${j.targetLanguage}#${j.id}`).join(", ") : r.data.error);
  if (ok) {
    for (const j of r.data.jobs) {
      const { job } = await runJob(j.id);
      check(`  multi-language job ${j.targetLanguage}`, job.status === "completed" && job.failed === 0, `${job.done}/${job.total}`);
    }
    console.log(`      3 languages in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  const tooMany = await call("POST", "/api/jobs", { projectId: project.id, targetLanguages: ["es", "fr", "de", "it", "pt", "ru", "ja", "ko", "hi", "tr", "nl"] });
  check("more than 10 languages rejected", tooMany.status === 400, tooMany.data.error);
  const sourceOnly = await call("POST", "/api/jobs", { projectId: project.id, targetLanguages: ["en"] });
  check("source language alone rejected", sourceOnly.status === 400, sourceOnly.data.error);
}

// Widget endpoints
const cfg = await call("GET", `/api/widget/config?key=${project.apiKey}`, undefined, { Origin: "http://localhost:8090" });
check("widget config lists translated languages", cfg.status === 200 && langs.every((l) => cfg.data.languages?.some((x) => x.code === l)), cfg.data.languages?.map((l) => l.code).join(","));
for (const lang of langs) {
  const d = await call("GET", `/api/widget/translations?key=${project.apiKey}&lang=${lang}`, undefined, { Origin: "http://localhost:8090" });
  const values = Object.values(d.data.dictionary || {});
  check(
    `widget dictionary ${lang}`,
    d.status === 200 && values.length > 20 && values.every((v) => !/^\[[A-Z]{2}/.test(v)),
    `${values.length} entries, sample: ${values.slice(0, 2).join(" | ")}`
  );
}
const blocked = await call("GET", `/api/widget/translations?key=${project.apiKey}&lang=es`, undefined, { Origin: "https://evil.example" });
check("widget rejects unauthorized origin", blocked.status === 403, `HTTP ${blocked.status}`);

// Error handling
const bad = await call("POST", "/api/translate-page", { projectId: project.id, targetLanguage: "es", url: "not a url" });
check("invalid URL rejected", bad.status === 422 || bad.status === 400, bad.data.error);
const ssrf = await call("POST", "/api/translate-page", { projectId: project.id, targetLanguage: "es", url: "http://169.254.169.254/latest/meta-data/" });
check("cloud metadata URL blocked (SSRF)", ssrf.status === 422, ssrf.data.error);
const priv = await call("POST", "/api/translate-page", { projectId: project.id, targetLanguage: "es", url: "http://192.168.1.1/" });
check("private network URL blocked (SSRF)", priv.status === 422, priv.data.error);
const unreachable = await call("POST", "/api/translate-page", { projectId: project.id, targetLanguage: "es", url: "https://does-not-exist.weblingo-test-invalid.com/" });
check("unreachable website reported", unreachable.status === 422, unreachable.data.error);
const badLang = await call("POST", "/api/translate-page", { projectId: project.id, targetLanguage: "xx", html: "<p>Hello there</p>" });
check("unsupported language rejected", badLang.status === 400, badLang.data.error);
const reset = await call("POST", "/api/reset-database", {});
check("reset-database requires sign-in", reset.status === 401 || reset.status === 403, `HTTP ${reset.status}`);

console.log(`\n${failures ? `${failures} check(s) FAILED` : "All checks passed"} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(`Serve the fixture site with:  node tests/serve-fixtures.mjs ${project.apiKey}`);
process.exit(failures ? 1 : 0);
