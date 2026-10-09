import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { campaign, campaignEntity, reward, rewardComponent, rewardGrant, rewardGrantComponent, userAccount } from "../../src/infrastructure/db/schema";
import { CampaignNotFoundError } from "../../src/modules/campaigns";
import type { Actor } from "../../src/modules/identity";
import { addRewardComponent, archiveReward, createReward, editReward, editRewardComponent,
  getOwnedReward, InvalidRewardInputError, listOwnedRewards, listRewardComponents,
  RewardNotFoundError, RewardRevisionConflictError, restoreReward, trashReward } from "../../src/modules/rewards";
import { InvalidRewardGrantInputError, listRewardGrants, recordRewardGrant,
  RewardGrantIdempotencyConflictError } from "../../src/modules/rewards/grants";

const schema = `reward_${randomUUID().replaceAll("-", "")}`;
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public` });
const db = drizzle({ client: pool });
let actor: Actor;
let other: Actor;
let campaignId: string;
let foreignCampaignId: string;

beforeAll(async () => {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries)
    await pool.query((await readFile(`drizzle/${tag}.sql`, "utf8")).replaceAll('"public".', `"${schema}".`));
});
beforeEach(async () => {
  await db.delete(campaign);
  await db.delete(userAccount);
  const [owner, stranger] = await db.insert(userAccount).values([{}, {}]).returning();
  actor = { userId: owner.id }; other = { userId: stranger.id };
  const [owned, foreign] = await db.insert(campaign).values([
    { ownerUserId: actor.userId, name: "Owned" }, { ownerUserId: other.userId, name: "Foreign" },
  ]).returning();
  campaignId = owned.id; foreignCampaignId = foreign.id;
});
afterAll(async () => { try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await pool.end(); } });

test("keeps reward identity and components in the same campaign", async () => {
  await expect(createReward(db, actor, { campaignId: foreignCampaignId, title: "Stolen" }))
    .rejects.toBeInstanceOf(CampaignNotFoundError);
  await expect(createReward(db, actor, { campaignId, title: " " }))
    .rejects.toBeInstanceOf(InvalidRewardInputError);
  const planned = await createReward(db, actor, { campaignId, title: "Crossing", notes: "For the party" });
  expect(planned).toMatchObject({ entityType: "REWARD", revision: 1, title: "Crossing" });
  expect(await listOwnedRewards(db, actor, campaignId)).toHaveLength(1);
  await expect(getOwnedReward(db, other, planned.id)).rejects.toBeInstanceOf(RewardNotFoundError);
  await expect(db.insert(reward).values({ id: randomUUID(), campaignId, title: "Orphan" }))
    .rejects.toMatchObject({ cause: { constraint: "reward_entity_fk" } });
  const component = await addRewardComponent(db, actor, planned.id,
    { expectedRevision: 1, kind: "INFORMATION", description: "The hidden route" });
  expect(component.kind).toBe("INFORMATION");
  await expect(db.insert(rewardComponent).values({ campaignId: foreignCampaignId,
    rewardId: planned.id, kind: "FAVOR", description: "Wrong campaign" }))
    .rejects.toMatchObject({ cause: { constraint: "reward_component_reward_fk" } });
  await expect(db.insert(campaignEntity).values({ campaignId, entityType: "UNKNOWN", createdByUserId: actor.userId }))
    .rejects.toMatchObject({ cause: { constraint: "campaign_entity_type_check" } });
});

test("protects edits, component resolution, and restoration", async () => {
  const planned = await createReward(db, actor, { campaignId, title: "Crossing" });
  await expect(addRewardComponent(db, other, planned.id,
    { expectedRevision: 1, kind: "ITEM", description: "Token" })).rejects.toBeInstanceOf(RewardNotFoundError);
  await expect(addRewardComponent(db, actor, planned.id,
    { expectedRevision: 1, kind: "ITEM", description: "Token" })).resolves.toBeDefined();
  await expect(editReward(db, actor, planned.id, { expectedRevision: 1, title: "Changed" }))
    .rejects.toBeInstanceOf(RewardRevisionConflictError);
  const [component] = await listRewardComponents(db, actor, planned.id);
  await editRewardComponent(db, actor, planned.id, component.id,
    { expectedRevision: 2, intent: "trash", kind: "ITEM", description: "Token" });
  expect((await listRewardComponents(db, actor, planned.id))[0].deletedAt).not.toBeNull();
  await editRewardComponent(db, actor, planned.id, component.id,
    { expectedRevision: 3, intent: "restore", kind: "ITEM", description: "Token" });
  const archived = await archiveReward(db, actor, planned.id, 4);
  const trashed = await trashReward(db, actor, planned.id, archived.revision);
  expect(trashed.purgeAfter).not.toBeNull();
  await expect(addRewardComponent(db, actor, planned.id,
    { expectedRevision: trashed.revision, kind: "MONEY", description: "10 coins" }))
    .rejects.toBeInstanceOf(InvalidRewardInputError);
  const restored = await restoreReward(db, actor, planned.id, trashed.revision);
  expect(restored.archivedAt).not.toBeNull();
  expect(restored.deletedAt).toBeNull();
  expect(await listRewardComponents(db, actor, planned.id)).toHaveLength(1);
  expect((await db.select().from(reward).where(eq(reward.id, planned.id))).length).toBe(1);
});

test("records an owned, immutable grant once and keeps its snapshot after plan edits", async () => {
  const planned = await createReward(db, actor, { campaignId, title: "Crossing" });
  const component = await addRewardComponent(db, actor, planned.id,
    { expectedRevision: 1, kind: "INFORMATION", description: "The hidden route" });
  const requestKey = randomUUID();
  const input = { requestKey, expectedRevision: 2, componentIds: [component.id], recipient: "The party" };
  await expect(recordRewardGrant(db, other, planned.id, input)).rejects.toBeInstanceOf(RewardNotFoundError);
  await expect(recordRewardGrant(db, actor, planned.id, { ...input, componentIds: [randomUUID()] }))
    .rejects.toBeInstanceOf(InvalidRewardGrantInputError);
  const first = await recordRewardGrant(db, actor, planned.id, input);
  expect((await recordRewardGrant(db, actor, planned.id, input)).id).toBe(first.id);
  await expect(recordRewardGrant(db, actor, planned.id, { ...input, recipient: "Someone else" }))
    .rejects.toBeInstanceOf(RewardGrantIdempotencyConflictError);
  await expect(recordRewardGrant(db, actor, planned.id,
    { ...input, requestKey: randomUUID() })).rejects.toBeInstanceOf(RewardRevisionConflictError);
  await editRewardComponent(db, actor, planned.id, component.id,
    { expectedRevision: 3, intent: "save", kind: "INFORMATION", description: "A changed route" });
  const [ledger] = await listRewardGrants(db, actor, campaignId);
  expect(ledger).toMatchObject({ id: first.id, rewardTitle: "Crossing", recipient: "The party",
    components: [{ kind: "INFORMATION", description: "The hidden route" }] });
  await expect(listRewardGrants(db, other, campaignId)).rejects.toBeInstanceOf(CampaignNotFoundError);
  await expect(db.insert(rewardGrant).values({ campaignId: foreignCampaignId, requestKey: randomUUID(),
    requestHash: "x", sourceCampaignId: campaignId, rewardId: planned.id, rewardTitle: "Bad", recipient: "Bad" }))
    .rejects.toMatchObject({ cause: { constraint: "reward_grant_source_scope" } });
  await expect(db.insert(rewardGrantComponent).values({ grantId: first.id, kind: "INVALID", description: "Bad" }))
    .rejects.toMatchObject({ cause: { constraint: "reward_grant_component_kind_check" } });
});
