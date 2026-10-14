import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";

if (!process.env.DATABASE_URL)
  throw new Error("Set DATABASE_URL before running migrations");
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});
try {
  await migrate(drizzle(pool), {
    migrationsFolder: fileURLToPath(new URL("./drizzle", import.meta.url)),
  });
  console.log("Database migrations applied.");
} finally {
  await pool.end();
}
