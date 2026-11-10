import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

const root = process.cwd();
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");

console.log("=== WebLingo local setup ===");

// 1. Ensure .env exists
if (!fs.existsSync(envPath)) {
  if (!fs.existsSync(examplePath)) {
    console.error("Missing .env.example; cannot continue.");
    process.exit(1);
  }
  fs.copyFileSync(examplePath, envPath);
  console.log("Created .env from .env.example");
}

// Load .env manually
const envText = fs.readFileSync(envPath, "utf8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set in .env");
  process.exit(1);
}

// 2. Ensure database exists
const url = new URL(databaseUrl);
const dbName = url.pathname.replace(/^\//, "");
const adminUrl = new URL(databaseUrl);
adminUrl.pathname = "/postgres";

const admin = new Client({ connectionString: adminUrl.toString() });
try {
  await admin.connect();
  const res = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (res.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${dbName}"`);
    console.log(`Created database: ${dbName}`);
  } else {
    console.log(`Database already exists: ${dbName}`);
  }
  await admin.end();
} catch (err) {
  console.error("Could not connect to PostgreSQL. Is it running? Error:", err.message);
  console.error("Install PostgreSQL 15+ and ensure it listens on", url.hostname, url.port || 5432);
  process.exit(1);
}

// 3. Push schema
console.log("Pushing database schema...");
try {
  execSync("npx drizzle-kit push", { stdio: "inherit", cwd: root });
} catch {
  console.error("Schema push failed.");
  process.exit(1);
}

// 4. Seed
console.log("Seeding database...");
try {
  execSync("npx tsx src/db/run-seed.ts", { stdio: "inherit", cwd: root });
} catch {
  console.error("Seeding failed.");
  process.exit(1);
}

console.log("\n=== Setup complete ===");
console.log("Start the app with: npm run dev");
console.log("Then open: http://localhost:3000");
console.log("(Optional) Start LibreTranslate for neural MT: libretranslate --host 0.0.0.0 --port 5000");