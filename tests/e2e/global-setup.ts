import { readFile } from "node:fs/promises";
import { clerkSetup } from "@clerk/testing/playwright";
import { schemaName, testPool } from "./database";

export default async function setup() {
  if (!process.env.E2E_CLERK_EMAIL?.trim()) {
    throw new Error("Set E2E_CLERK_EMAIL to an existing development-instance test user.");
  }
  if (!process.env.CLERK_SECRET_KEY?.startsWith("sk_test_") ||
      !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_")) {
    throw new Error("A10 requires Clerk development instance keys.");
  }
  await clerkSetup();
  const pool = testPool();
  const schema = schemaName();
  let created = false;
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries) {
      const sql = await readFile(`drizzle/${tag}.sql`, "utf8");
      await pool.query(sql.replaceAll('"public".', `"${schema}".`));
    }
  } catch (error) {
    if (created) await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    throw error;
  } finally { await pool.end(); }
}
