import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { authIdentity, userAccount } from "../../src/infrastructure/db/schema";
import { resolveIdentity } from "../../src/modules/identity";

// Isolate committed concurrent transactions so account counts detect orphans
// without interference from other suites or preexisting test database contents.
const schema = `a6_identity_${randomUUID().replaceAll("-", "")}`;
const pool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: `-c search_path=${schema},public`,
});
const db = drizzle({ client: pool });
const identity = { provider: "test-provider", providerSubject: "subject-a" };

beforeAll(async () => {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as {
    entries: { tag: string }[];
  };
  for (const { tag } of journal.entries) {
    const migration = await readFile(`drizzle/${tag}.sql`, "utf8");
    await pool.query(migration.replaceAll('"public".', `"${schema}".`));
  }
});
beforeEach(async () => {
  await db.delete(authIdentity);
  await db.delete(userAccount);
});
afterAll(async () => {
  try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
  finally { await pool.end(); }
});

test("first resolution creates one account and mapping, returning only an internal Actor", async () => {
  const actor = await resolveIdentity(db, identity);
  const accounts = await db.select().from(userAccount);
  expect(accounts).toHaveLength(1);
  expect(actor).toEqual({ userId: accounts[0].id });
  expect(actor.userId).not.toBe(identity.providerSubject);
  expect(await db.select().from(authIdentity)).toEqual([
    expect.objectContaining({ ...identity, userId: actor.userId }),
  ]);
});

test("repeated resolution returns the existing Actor without duplicates or updates", async () => {
  const actor = await resolveIdentity(db, identity);
  const accounts = await db.select().from(userAccount);
  const mappings = await db.select().from(authIdentity);
  await expect(resolveIdentity(db, identity)).resolves.toEqual(actor);
  expect(await db.select().from(userAccount)).toEqual(accounts);
  expect(await db.select().from(authIdentity)).toEqual(mappings);
});

test("subjects and providers resolve independently", async () => {
  const actors = await Promise.all([
    resolveIdentity(db, identity),
    resolveIdentity(db, { ...identity, providerSubject: "subject-b" }),
    resolveIdentity(db, { ...identity, provider: "other-provider" }),
  ]);
  expect(new Set(actors.map(actor => actor.userId)).size).toBe(3);
  expect(await db.select().from(userAccount)).toHaveLength(3);
  expect(await db.select().from(authIdentity)).toHaveLength(3);
});

test("concurrent first resolutions keep one mapping and no orphan accounts", async () => {
  const blocker = await pool.connect();
  const contenders = 6;
  let pending: Promise<PromiseSettledResult<Awaited<ReturnType<typeof resolveIdentity>>>[]> | undefined;
  try {
    await blocker.query("BEGIN");
    await blocker.query("LOCK TABLE user_account IN ACCESS EXCLUSIVE MODE");
    pending = Promise.allSettled(Array.from({ length: contenders }, () => resolveIdentity(db, identity)));
    // All callers must pass the missing-mapping read and block on account
    // insertion before releasing them. No timing assumption about Promise.all.
    const deadline = Date.now() + 5000;
    let waiting = 0;
    while (waiting < contenders && Date.now() < deadline) {
      const result = await blocker.query(`SELECT count(*)::int AS count FROM pg_locks
        WHERE relation = 'user_account'::regclass AND NOT granted`);
      waiting = result.rows[0].count;
      if (waiting < contenders) await setTimeout(10);
    }
    expect(waiting).toBe(contenders);
    await blocker.query("COMMIT");
    const results = await pending;
    const [account] = await db.select().from(userAccount);
    expect(results).toEqual(Array.from({ length: contenders }, () => ({
      status: "fulfilled", value: { userId: account.id },
    })));
    expect(await db.select().from(userAccount)).toHaveLength(1);
    expect(await db.select().from(authIdentity)).toHaveLength(1);
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    await pending;
  }
}, 15000);

test("mapping failure rolls back account creation and propagates the database error", async () => {
  await pool.query("ALTER TABLE auth_identity ADD CONSTRAINT a6_reject_mapping CHECK (provider <> 'reject')");
  try {
    await expect(resolveIdentity(db, { ...identity, provider: "reject" }))
      .rejects.toMatchObject({ cause: { code: "23514", constraint: "a6_reject_mapping" } });
    expect(await db.select().from(userAccount)).toEqual([]);
    expect(await db.select().from(authIdentity)).toEqual([]);
  } finally {
    await pool.query("ALTER TABLE auth_identity DROP CONSTRAINT a6_reject_mapping");
  }
});

test.each([
  { provider: " ", providerSubject: "subject" },
  { provider: "provider", providerSubject: "" },
])("rejects empty identity input before persistence: %j", async input => {
  await expect(resolveIdentity(db, input)).rejects.toBeInstanceOf(TypeError);
  expect(await db.select().from(userAccount)).toEqual([]);
  expect(await db.select().from(authIdentity)).toEqual([]);
});
