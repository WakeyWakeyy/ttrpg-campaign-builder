import { sql } from "drizzle-orm";
import { expect, test } from "vitest";
import { createDatabase } from "../../src/infrastructure/db";

test("executes a query against real PostgreSQL", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString?.trim()) {
    throw new Error("Set TEST_DATABASE_URL to a dedicated test PostgreSQL database.");
  }

  const { db, pool } = createDatabase(connectionString);
  try {
    const result = await db.execute(sql`SELECT 1 AS value`);
    expect(result.rows).toEqual([{ value: 1 }]);
  } finally {
    await pool.end();
  }
});
