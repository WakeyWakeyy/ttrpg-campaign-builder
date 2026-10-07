import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { campaign, campaignEntity, semanticRelationship, userAccount } from "../../src/infrastructure/db/schema";
import { CampaignNotFoundError } from "../../src/modules/campaigns";
import type { Actor } from "../../src/modules/identity";
import { createLocation } from "../../src/modules/locations";
import { createRelationship, editRelationship, getOwnedRelationship, InvalidRelationshipInputError,
  listOwnedRelationships, archiveRelationship, trashRelationship, restoreRelationship,
  RelationshipNotFoundError, RelationshipRevisionConflictError } from "../../src/modules/relationships";

const schema = `a24_relationship_${randomUUID().replaceAll("-", "")}`;
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public` });
const db = drizzle({ client: pool });
let actor: Actor;
let other: Actor;
let campaignId: string;
let foreignCampaignId: string;

beforeAll(async () => {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries) {
    await pool.query((await readFile(`drizzle/${tag}.sql`, "utf8")).replaceAll('"public".', `"${schema}".`));
  }
});
beforeEach(async () => {
  await db.delete(semanticRelationship);
  await db.delete(campaign);
  await db.delete(userAccount);
  const [owner, stranger] = await db.insert(userAccount).values([{}, {}]).returning();
  actor = { userId: owner.id };
  other = { userId: stranger.id };
  const [owned, foreign] = await db.insert(campaign).values([
    { ownerUserId: actor.userId, name: "Owned" }, { ownerUserId: other.userId, name: "Foreign" },
  ]).returning();
  campaignId = owned.id;
  foreignCampaignId = foreign.id;
});
afterAll(async () => {
  try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
  finally { await pool.end(); }
});

test("only owned same-Campaign entities can be connected, and typed rows are atomic", async () => {
  const a = await createLocation(db, actor, { campaignId, name: "Keep" });
  const b = await createLocation(db, actor, { campaignId, name: "Village" });
  const outsider = await createLocation(db, other, { campaignId: foreignCampaignId, name: "Other" });
  const input = { campaignId, sourceEntityId: a.id, targetEntityId: b.id, kind: "protects" };
  await expect(createRelationship(db, actor, { ...input, campaignId: foreignCampaignId }))
    .rejects.toBeInstanceOf(CampaignNotFoundError);
  await expect(createRelationship(db, actor, { ...input, targetEntityId: outsider.id }))
    .rejects.toBeInstanceOf(InvalidRelationshipInputError);
  const first = await createRelationship(db, actor, input);
  expect(first).toMatchObject({ entityType: "RELATIONSHIP", revision: 1, kind: "protects" });
  await expect(getOwnedRelationship(db, other, first.id)).rejects.toBeInstanceOf(RelationshipNotFoundError);
  await createRelationship(db, actor, input); // Repeated semantics remain meaningful.
  await createRelationship(db, actor, { ...input, sourceEntityId: b.id, targetEntityId: a.id, kind: "fears" });
  expect(await listOwnedRelationships(db, actor, campaignId)).toHaveLength(3);
  await expect(db.insert(semanticRelationship).values({
    id: randomUUID(), campaignId, sourceEntityId: a.id, targetEntityId: b.id, kind: "orphan",
  })).rejects.toMatchObject({ cause: { code: "23503", constraint: "semantic_relationship_entity_fk" } });
  const [entity] = await db.insert(campaignEntity).values({
    campaignId, entityType: "RELATIONSHIP", createdByUserId: actor.userId,
  }).returning();
  await expect(db.insert(semanticRelationship).values({
    id: entity.id, campaignId, sourceEntityId: a.id, targetEntityId: outsider.id, kind: "cross",
  })).rejects.toMatchObject({ cause: { code: "23503", constraint: "semantic_relationship_target_fk" } });
});

test("revision protection and lifecycle preserve the semantic link", async () => {
  const a = await createLocation(db, actor, { campaignId, name: "Keep" });
  const b = await createLocation(db, actor, { campaignId, name: "Village" });
  const input = { campaignId, sourceEntityId: a.id, targetEntityId: b.id, kind: "protects" };
  const created = await createRelationship(db, actor, input);
  const results = await Promise.allSettled([
    editRelationship(db, actor, created.id, { ...input, kind: "fears", expectedRevision: 1 }),
    editRelationship(db, actor, created.id, { ...input, kind: "knows", expectedRevision: 1 }),
  ]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(results.find(result => result.status === "rejected"))
    .toMatchObject({ reason: expect.any(RelationshipRevisionConflictError) });
  const current = await getOwnedRelationship(db, actor, created.id);
  const archived = await archiveRelationship(db, actor, created.id, current.revision);
  const trashed = await trashRelationship(db, actor, created.id, archived.revision);
  const restored = await restoreRelationship(db, actor, created.id, trashed.revision);
  expect(restored).toMatchObject({ sourceEntityId: a.id, targetEntityId: b.id,
    archivedAt: archived.archivedAt, deletedAt: null });
});
