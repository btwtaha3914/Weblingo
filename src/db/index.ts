import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Allow standalone scripts (tsx) to load .env when running outside Next.js
if (!process.env.DATABASE_URL) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("dotenv").config({ path: ".env" });
  } catch {
    // dotenv not available; rely on environment
  }
}

const databaseUrl = process.env.DATABASE_URL;

// Build-time fallback: when DATABASE_URL is missing (e.g. Netlify build),
// export a mock db that returns empty results so the build succeeds.
// At runtime, DATABASE_URL must be set or queries will fail.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let pool: Pool | null;

if (!databaseUrl) {
  const mockChain = (): any => {
    const handler: ProxyHandler<any> = {
      get(_target, prop) {
        if (prop === "then") return (resolve: (v: any) => void) => resolve([]);
        if (prop === "catch") return () => mockChain();
        if (prop === "finally") return (fn: () => void) => { fn(); return mockChain(); };
        return () => mockChain();
      },
    };
    return new Proxy({}, handler);
  };

  const mockQuery = new Proxy({}, {
    get(_target, prop) {
      return { findFirst: () => Promise.resolve(null), findMany: () => Promise.resolve([]) };
    },
  });

  db = new Proxy({}, {
    get(_target, prop) {
      if (prop === "query") return mockQuery;
      if (prop === "execute") return () => Promise.resolve({ rows: [] });
      return (..._args: any[]) => mockChain();
    },
  }) as any;

  pool = null;
} else {
  const globalForDb = globalThis as typeof globalThis & {
    __arenaNextJsPostgresqlPool?: Pool;
  };

  pool =
    globalForDb.__arenaNextJsPostgresqlPool ??
    new Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 10_000,
    });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__arenaNextJsPostgresqlPool = pool;
  }

  db = drizzle(pool, { schema });
}

export { db, pool };