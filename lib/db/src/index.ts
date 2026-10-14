import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

let pool: pg.Pool | undefined;
// Keep health checks and builds available before the database is configured.
export function getPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  return pool ??= new Pool({ connectionString: process.env.DATABASE_URL,
    max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 });
}
export function getDb() { return drizzle(getPool(), { schema }); }

export * from "./schema";
