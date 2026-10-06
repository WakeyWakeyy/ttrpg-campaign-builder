import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";
import { blueprintDraft, blueprintMaterialization, blueprintProposal, campaign, campaignEntity, commandExecution, location, ruleset, rulesetVersion, userAccount } from "../../src/infrastructure/db/schema";
import { BlueprintAlreadyMaterializedError, BlueprintIdempotencyConflictError, BlueprintNotFoundError, BlueprintRevisionConflictError, createBlueprint, decideBlueprintProposal, editBlueprint, getBlueprintReview, getOwnedBlueprint, listOwnedBlueprints, materializeBlueprint, startBlueprintReview } from "../../src/modules/blueprints";

const schema = `blueprint_${randomUUID().replaceAll("-", "")}`;
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public` });
const db = drizzle({ client: pool });
let owner: { userId: string };
let other: { userId: string };
const idea = { title: "Sunken city", premise: "A city resurfaces.", setting: "Coast", tone: "Wonder", proposedLocations: ["Harbor", "Vault"] };

beforeAll(async () => {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries) {
    const migration = await readFile(`drizzle/${tag}.sql`, "utf8");
    await pool.query(migration.replaceAll('"public".', `"${schema}".`));
  }
  const accounts = await db.insert(userAccount).values([{}, {}]).returning();
  owner = { userId: accounts[0].id };
  other = { userId: accounts[1].id };
});
afterAll(async () => { try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await pool.end(); } });

test("draft stays outside Campaign truth and is private to its internal owner", async () => {
  const draft = await createBlueprint(db, owner, idea);
  expect(draft).toMatchObject({ ownerUserId: owner.userId, revision: 1, proposedLocations: idea.proposedLocations });
  expect(await db.select().from(campaign)).toEqual([]);
  expect(await listOwnedBlueprints(db, other)).toEqual([]);
  await expect(getOwnedBlueprint(db, other, draft.id)).rejects.toBeInstanceOf(BlueprintNotFoundError);
  await expect(editBlueprint(db, other, draft.id, 1, idea)).rejects.toBeInstanceOf(BlueprintNotFoundError);
});

test("accepted edit advances revision and stale edit cannot overwrite it", async () => {
  const draft = await createBlueprint(db, owner, idea);
  const accepted = await editBlueprint(db, owner, draft.id, 1, { ...idea, title: "Resurfaced city", proposedLocations: ["Harbor"] });
  expect(accepted.revision).toBe(2);
  await expect(editBlueprint(db, owner, draft.id, 1, { ...idea, title: "Stale" })).rejects.toBeInstanceOf(BlueprintRevisionConflictError);
  expect((await db.select().from(blueprintDraft)).find(row => row.id === draft.id)).toMatchObject({ title: "Resurfaced city", proposedLocations: ["Harbor"], revision: 2 });
});

test("review keeps rejected nodes and materializes accepted Locations exactly once", async () => {
  const draft = await createBlueprint(db, owner, idea);
  await expect(startBlueprintReview(db, other, draft.id, draft.revision)).rejects.toBeInstanceOf(BlueprintNotFoundError);
  const started = await startBlueprintReview(db, owner, draft.id, draft.revision);
  const initial = await getBlueprintReview(db, owner, draft.id);
  expect(initial.proposals.map(row => row.name)).toEqual(["Harbor", "Vault"]);
  await expect(decideBlueprintProposal(db, owner, draft.id, initial.proposals[0].id, draft.revision, "Harbor", "ACCEPTED")).rejects.toBeInstanceOf(BlueprintRevisionConflictError);
  await decideBlueprintProposal(db, owner, draft.id, initial.proposals[0].id, started.revision, "New Harbor", "ACCEPTED");
  await decideBlueprintProposal(db, owner, draft.id, initial.proposals[1].id, started.revision + 1, "Vault", "REJECTED");
  const [family] = await db.insert(ruleset).values({ key: randomUUID(), name: "Review ruleset" }).returning();
  const [version] = await db.insert(rulesetVersion).values({ rulesetId: family.id, version: "1", name: "First" }).returning();
  const request = { blueprintId: draft.id, expectedRevision: started.revision + 2, rulesetVersionId: version.id, idempotencyKey: randomUUID() };
  await expect(materializeBlueprint(db, other, request)).rejects.toBeInstanceOf(BlueprintNotFoundError);
  const result = await materializeBlueprint(db, owner, request);
  expect((await materializeBlueprint(db, owner, request)).campaignId).toBe(result.campaignId);
  expect((await db.select().from(location)).filter(row => row.campaignId === result.campaignId).map(row => row.name)).toEqual(["New Harbor"]);
  expect((await db.select().from(blueprintProposal)).filter(row => row.blueprintId === draft.id).map(row => row.decision)).toEqual(["ACCEPTED", "REJECTED"]);
  expect((await db.select().from(blueprintMaterialization)).find(row => row.blueprintId === draft.id)?.campaignId).toBe(result.campaignId);
  await expect(materializeBlueprint(db, owner, { ...request, idempotencyKey: randomUUID() })).rejects.toBeInstanceOf(BlueprintAlreadyMaterializedError);
  await expect(materializeBlueprint(db, owner, { ...request, expectedRevision: request.expectedRevision + 1 })).rejects.toBeInstanceOf(BlueprintIdempotencyConflictError);
});

test("materialization rolls back all rows when a later Location insert fails", async () => {
  const draft = await createBlueprint(db, owner, { ...idea, proposedLocations: ["First", "Second"] });
  const started = await startBlueprintReview(db, owner, draft.id, draft.revision);
  const review = await getBlueprintReview(db, owner, draft.id);
  await decideBlueprintProposal(db, owner, draft.id, review.proposals[0].id, started.revision, "First", "ACCEPTED");
  await decideBlueprintProposal(db, owner, draft.id, review.proposals[1].id, started.revision + 1, "Second", "ACCEPTED");
  const [family] = await db.insert(ruleset).values({ key: randomUUID(), name: "Rollback ruleset" }).returning();
  const [version] = await db.insert(rulesetVersion).values({ rulesetId: family.id, version: "1", name: "First" }).returning();
  const campaignsBefore = (await db.select().from(campaign)).length;
  const entitiesBefore = (await db.select().from(campaignEntity)).length;
  await pool.query("ALTER TABLE location ADD CONSTRAINT blueprint_rollback_probe CHECK (name <> 'Second')");
  const key = randomUUID();
  try {
    await expect(materializeBlueprint(db, owner, { blueprintId: draft.id, expectedRevision: started.revision + 2, rulesetVersionId: version.id, idempotencyKey: key })).rejects.toThrow();
    expect((await db.select().from(blueprintMaterialization)).some(row => row.blueprintId === draft.id)).toBe(false);
    expect((await db.select().from(commandExecution)).some(row => row.idempotencyKey === key)).toBe(false);
    expect(await db.select().from(campaign)).toHaveLength(campaignsBefore);
    expect(await db.select().from(campaignEntity)).toHaveLength(entitiesBefore);
  } finally { await pool.query("ALTER TABLE location DROP CONSTRAINT blueprint_rollback_probe"); }
});

test("concurrent materialization keys cannot create two Campaigns", async () => {
  const draft = await createBlueprint(db, owner, { ...idea, title: `Concurrent ${randomUUID()}`, proposedLocations: [] });
  const started = await startBlueprintReview(db, owner, draft.id, draft.revision);
  const [family] = await db.insert(ruleset).values({ key: randomUUID(), name: "Concurrent ruleset" }).returning();
  const [version] = await db.insert(rulesetVersion).values({ rulesetId: family.id, version: "1", name: "First" }).returning();
  const input = { blueprintId: draft.id, expectedRevision: started.revision, rulesetVersionId: version.id };
  const results = await Promise.allSettled([
    materializeBlueprint(db, owner, { ...input, idempotencyKey: randomUUID() }),
    materializeBlueprint(db, owner, { ...input, idempotencyKey: randomUUID() }),
  ]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(result => result.status === "rejected" && result.reason instanceof BlueprintAlreadyMaterializedError)).toHaveLength(1);
  expect((await db.select().from(blueprintMaterialization)).filter(row => row.blueprintId === draft.id)).toHaveLength(1);
});
