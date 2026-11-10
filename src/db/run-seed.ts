import { config } from "dotenv";
config({ path: ".env" });

import { seedDatabase } from "./seed";
import { pool } from "./index";

async function main() {
  try {
    await seedDatabase();
    console.log("Seeding finished successfully.");
    process.exit(0);
  } catch (err) {
    console.error("Seeding failed with error:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
