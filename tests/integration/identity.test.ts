import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { afterAll, afterEach, beforeEach, expect, test } from "vitest";
import { createDatabase } from "../../src/infrastructure/db";
import { authIdentity, userAccount } from "../../src/infrastructure/db/schema";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString?.trim()) {
  throw new Error("Set TEST_DATABASE_URL to a dedicated test PostgreSQL database.");
}

const { pool } = createDatabase(connectionString);
let client: PoolClient | undefined;
let db: NodePgDatabase;

beforeEach(async () => {
  client = await pool.connect();
  await client.query("BEGIN");
  db = drizzle({ client });
});

afterEach(async () => {
  if (client) {
    try {
      // ROLLBACK also cleans up transactions aborted by constraint violations.
      await client.query("ROLLBACK");
    } finally {
      client.release();
      client = undefined;
    }
  }
});

afterAll(async () => {
  await pool.end();
});

test("inserts a user account with generated identity and timestamps", async () => {
  const [user] = await db.insert(userAccount).values({}).returning();

  expect(user.id).toEqual(expect.any(String));
  expect(user.createdAt).toBeInstanceOf(Date);
  expect(user.updatedAt).toBeInstanceOf(Date);
  expect(await db.select().from(userAccount).where(eq(userAccount.id, user.id)))
    .toEqual([user]);
});

test("inserts an auth identity for an existing user", async () => {
  const [user] = await db.insert(userAccount).values({}).returning();
  const values = {
    userId: user.id,
    provider: "integration-test",
    providerSubject: user.id,
  };
  const [identity] = await db.insert(authIdentity).values(values).returning();

  expect(identity).toMatchObject({
    ...values,
    id: expect.any(String),
    createdAt: expect.any(Date),
    updatedAt: expect.any(Date),
  });
  expect(await db.select().from(authIdentity).where(eq(authIdentity.id, identity.id)))
    .toEqual([identity]);
});

test("rejects the same provider and subject even for a different user", async () => {
  const [firstUser, secondUser] = await db.insert(userAccount).values([{}, {}]).returning();
  const providerIdentity = {
    provider: "integration-test",
    providerSubject: firstUser.id,
  };
  await db.insert(authIdentity).values({ ...providerIdentity, userId: firstUser.id });

  await expect(
    db.insert(authIdentity).values({ ...providerIdentity, userId: secondUser.id }),
  ).rejects.toMatchObject({
    cause: {
      code: "23505",
      constraint: "auth_identity_provider_subject_unique",
    },
  });
});

test("rejects an auth identity referencing a nonexistent user", async () => {
  const [user] = await db.insert(userAccount).values({}).returning();
  await db.delete(userAccount).where(eq(userAccount.id, user.id));

  await expect(
    db.insert(authIdentity).values({
      userId: user.id,
      provider: "integration-test",
      providerSubject: user.id,
    }),
  ).rejects.toMatchObject({
    cause: {
      code: "23503",
      constraint: "auth_identity_user_id_user_account_id_fk",
    },
  });
});

test("deleting a user cascades to all of their auth identities", async () => {
  const [user] = await db.insert(userAccount).values({}).returning();
  await db.insert(authIdentity).values([
    { userId: user.id, provider: "integration-test-a", providerSubject: user.id },
    { userId: user.id, provider: "integration-test-b", providerSubject: user.id },
  ]);
  expect(await db.select().from(authIdentity).where(eq(authIdentity.userId, user.id)))
    .toHaveLength(2);

  await db.delete(userAccount).where(eq(userAccount.id, user.id));

  expect(await db.select().from(userAccount).where(eq(userAccount.id, user.id)))
    .toEqual([]);
  expect(await db.select().from(authIdentity).where(eq(authIdentity.userId, user.id)))
    .toEqual([]);
});
