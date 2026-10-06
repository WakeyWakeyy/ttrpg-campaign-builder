import { Pool } from "pg";

export function schemaName() {
  const schema = process.env.E2E_SCHEMA;
  if (!schema || !/^a10_[a-f0-9]{32}$/.test(schema)) throw new Error("Invalid E2E schema.");
  return schema;
}

export function testPool() {
  schemaName();
  const connectionString = process.env.E2E_SCOPED_DATABASE_URL;
  if (!connectionString) throw new Error("Missing scoped E2E database URL.");
  return new Pool({ connectionString });
}
