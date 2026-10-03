import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Callers own the database lifecycle and cleanup via pool.end().
export function createDatabase(connectionString = process.env.DATABASE_URL) {
  if (!connectionString?.trim()) {
    throw new Error("DATABASE_URL is required to initialize the database.");
  }

  // pg opens connections on demand, when a query or checkout is requested.
  const pool = new Pool({ connectionString });
  const db = drizzle({ client: pool });

  return { db, pool };
}
