import { schemaName, testPool } from "./database";

export default async function teardown() {
  const pool = testPool();
  try { await pool.query(`DROP SCHEMA IF EXISTS "${schemaName()}" CASCADE`); }
  finally { await pool.end(); }
}
