import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";
import { archiveLocation, unarchiveLocation, trashLocation, restoreLocation, LocationNotFoundError, LocationRevisionConflictError, InvalidLocationInputError } from "../../src/modules/locations";
import { archiveSession, unarchiveSession, trashSession, restoreSession, SessionNotFoundError, SessionRevisionConflictError, InvalidSessionInputError } from "../../src/modules/sessions";
import { archiveEncounter, unarchiveEncounter, trashEncounter, restoreEncounter, EncounterNotFoundError, EncounterRevisionConflictError, InvalidEncounterInputError } from "../../src/modules/encounters";
import { archiveReward, unarchiveReward, trashReward, restoreReward, RewardNotFoundError, RewardRevisionConflictError, InvalidRewardInputError } from "../../src/modules/rewards";
import { recordRewardGrant } from "../../src/modules/rewards/grants";

const schema = `unarchive_${randomUUID().replaceAll("-", "")}`;
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL,
  options: `-c search_path=${schema},public -c timezone=America/New_York -c lock_timeout=4000` });
const db = drizzle({ client: pool });
let actor: { userId: string }, other: { userId: string }, campaignId: string, root: string;
const cases = [
  { kind: "LOCATION", table: "location", archive: archiveLocation, unarchive: unarchiveLocation, trash: trashLocation, restore: restoreLocation, missing: LocationNotFoundError, conflict: LocationRevisionConflictError, invalid: InvalidLocationInputError },
  { kind: "SESSION", table: "session", archive: archiveSession, unarchive: unarchiveSession, trash: trashSession, restore: restoreSession, missing: SessionNotFoundError, conflict: SessionRevisionConflictError, invalid: InvalidSessionInputError },
  { kind: "ENCOUNTER", table: "encounter", archive: archiveEncounter, unarchive: unarchiveEncounter, trash: trashEncounter, restore: restoreEncounter, missing: EncounterNotFoundError, conflict: EncounterRevisionConflictError, invalid: InvalidEncounterInputError },
  { kind: "REWARD", table: "reward", archive: archiveReward, unarchive: unarchiveReward, trash: trashReward, restore: restoreReward, missing: RewardNotFoundError, conflict: RewardRevisionConflictError, invalid: InvalidRewardInputError },
] as const;

async function registry(kind: string, archived = false) {
  return (await pool.query(`INSERT INTO campaign_entity(campaign_id,entity_type,created_by_user_id,created_at,updated_at,archived_at)
    VALUES($1,$2,$3,'2026-01-01Z','2026-01-01Z',CASE WHEN $4 THEN '2026-01-02Z'::timestamptz END) RETURNING id`,
  [campaignId, kind, actor.userId, archived])).rows[0].id as string;
}
beforeAll(async () => {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries)
    await pool.query((await readFile(`drizzle/${tag}.sql`, "utf8")).replaceAll('"public".', `"${schema}".`));
  actor = { userId: (await pool.query("INSERT INTO user_account DEFAULT VALUES RETURNING id")).rows[0].id };
  other = { userId: (await pool.query("INSERT INTO user_account DEFAULT VALUES RETURNING id")).rows[0].id };
  campaignId = (await pool.query("INSERT INTO campaign(owner_user_id,name) VALUES($1,'Lifecycle') RETURNING id", [actor.userId])).rows[0].id;
  root = await registry("LOCATION");
  await pool.query("INSERT INTO location(id,campaign_id,name) VALUES($1,$2,'Unchanged root')", [root,campaignId]);
});
afterAll(async () => { try { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await pool.end(); } });

async function fixture(spec: typeof cases[number]) {
  const id = await registry(spec.kind);
  await pool.query(`INSERT INTO ${spec.table}(id,campaign_id,${spec.kind === "LOCATION" ? "name" : "title"}) VALUES($1,$2,'Persisted GM content')`, [id,campaignId]);
  if (spec.kind === "LOCATION") {
    await pool.query("UPDATE location SET parent_location_id=$2 WHERE id=$1", [id,root]);
    const child = await registry("LOCATION", true);
    await pool.query("INSERT INTO location(id,campaign_id,name,parent_location_id) VALUES($1,$2,'Archived child',$3)", [child,campaignId,id]);
  }
  if (spec.kind === "SESSION") await pool.query("INSERT INTO scene(campaign_id,session_id,position,title,preparation,outcome,deleted_at) VALUES($1,$2,1,'Removed scene','Plan','Result','2026-01-02Z')", [campaignId,id]);
  if (spec.kind === "ENCOUNTER") {
    await pool.query("INSERT INTO encounter_srd_521_plan(encounter_id,campaign_id,party_level,party_size) VALUES($1,$2,1,4)", [id,campaignId]);
    await pool.query("INSERT INTO encounter_srd_521_creature(encounter_id,campaign_id,name,xp,quantity,deleted_at) VALUES($1,$2,'Removed creature',100,2,'2026-01-02Z')", [id,campaignId]);
  }
  if (spec.kind === "REWARD") {
    const component = (await pool.query("INSERT INTO reward_component(reward_id,campaign_id,kind,description) VALUES($1,$2,'FAVOR','Persisted favor') RETURNING id", [id,campaignId])).rows[0].id;
    await pool.query("INSERT INTO reward_component(reward_id,campaign_id,kind,description,deleted_at) VALUES($1,$2,'FAVOR','Removed favor','2026-01-02Z')", [id,campaignId]);
    await recordRewardGrant(db, actor, id, { expectedRevision: 1, requestKey: randomUUID(), componentIds: [component], recipient: "Party", notes: "Immutable history", sessionId: null });
  }
  const relationship = await registry("RELATIONSHIP");
  await pool.query("INSERT INTO semantic_relationship(id,campaign_id,source_entity_id,target_entity_id,kind) VALUES($1,$2,$3,$4,'supports')", [relationship,campaignId,id,root]);
  return id;
}
async function row(id: string) {
  return (await pool.query("SELECT *, updated_at::text AS exact_updated_at, xmin::text AS row_version FROM campaign_entity WHERE id=$1", [id])).rows[0];
}
async function preserved(id: string) {
  const result: Record<string, unknown> = {};
  result.otherEntities = (await pool.query("SELECT to_jsonb(t) AS data, t.xmin::text AS row_version FROM campaign_entity t WHERE id<>$1 ORDER BY id", [id])).rows;
  for (const table of ["campaign", "location", "session", "scene", "encounter", "encounter_srd_521_plan", "encounter_srd_521_creature", "encounter_run", "reward", "reward_component", "reward_grant", "reward_grant_component", "semantic_relationship"])
    result[table] = (await pool.query(`SELECT to_jsonb(t) AS data, t.xmin::text AS row_version FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows;
  return result;
}
for (const spec of cases) {
  test(`${spec.kind}: Active no-op still checks owner, identity and the original revision`, async () => {
    const id = await fixture(spec), original = await row(id);
    await expect(spec.unarchive(db, other, id, original.revision)).rejects.toBeInstanceOf(spec.missing);
    for (const invalidId of [randomUUID(), "invalid"]) await expect(spec.unarchive(db, actor, invalidId, 1)).rejects.toBeInstanceOf(spec.missing);
    for (const revision of [0, -1, 1.5, 2147483648, Number.NaN]) await expect(spec.unarchive(db, actor, id, revision)).rejects.toBeInstanceOf(spec.invalid);
    await expect(spec.unarchive(db, actor, id, original.revision + 1)).rejects.toBeInstanceOf(spec.conflict);
    await spec.unarchive(db, actor, id, original.revision);
    expect(await row(id)).toEqual(original);
  });
  test(`${spec.kind}: Unarchive updates only archive/revision/timestamp; related state and history stay intact`, async () => {
    const id = await fixture(spec), initial = await row(id);
    await spec.archive(db, actor, id, initial.revision);
    const archived = await row(id), related = await preserved(id);
    await spec.unarchive(db, actor, id, archived.revision);
    const active = await row(id);
    expect(active.archived_at).toBeNull(); expect(active.revision).toBe(archived.revision + 1);
    expect(active.exact_updated_at).not.toBe(archived.exact_updated_at);
    expect(active.row_version).not.toBe(archived.row_version);
    expect({ ...active, archived_at: archived.archived_at, revision: archived.revision, updated_at: archived.updated_at, exact_updated_at: archived.exact_updated_at, row_version: archived.row_version }).toEqual(archived);
    expect(await preserved(id)).toEqual(related);
    await spec.unarchive(db, actor, id, active.revision); expect(await row(id)).toEqual(active);
    await expect(spec.unarchive(db, actor, id, archived.revision)).rejects.toBeInstanceOf(spec.conflict);
  });
  test(`${spec.kind}: Trash is a no-op; Restore preserves Archived until explicit Unarchive`, async () => {
    const id = await fixture(spec), initial = await row(id);
    await spec.archive(db, actor, id, initial.revision);
    const archived = await row(id);
    await spec.trash(db, actor, id, archived.revision);
    const trashed = await row(id), related = await preserved(id);
    await spec.unarchive(db, actor, id, trashed.revision); expect(await row(id)).toEqual(trashed);
    await expect(spec.unarchive(db, actor, id, archived.revision)).rejects.toBeInstanceOf(spec.conflict);
    expect(trashed.purge_after.getTime() - trashed.deleted_at.getTime()).toBe(30 * 86400000);
    await spec.restore(db, actor, id, trashed.revision);
    const restored = await row(id);
    expect(restored).toMatchObject({ archived_at: archived.archived_at, deleted_at: null, purge_after: null });
    await spec.unarchive(db, actor, id, restored.revision);
    expect(await row(id)).toMatchObject({ archived_at: null, deleted_at: null, purge_after: null, revision: restored.revision + 1 });
    expect(await preserved(id)).toEqual(related);
  });
  test(`${spec.kind}: concurrent Unarchive and Trash accept only one command at the shared revision`, async () => {
    const id = await fixture(spec), initial = await row(id);
    await spec.archive(db, actor, id, initial.revision);
    const archived = await row(id);
    const results = await Promise.allSettled([spec.unarchive(db, actor, id, archived.revision), spec.trash(db, actor, id, archived.revision)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const failure = results.find(result => result.status === "rejected");
    expect(failure?.status === "rejected" && failure.reason).toBeInstanceOf(spec.conflict);
    expect((await row(id)).revision).toBe(archived.revision + 1);
  });
  test(`${spec.kind}: Archive over Trash keeps its existing behavior and retention`, async () => {
    const id = await fixture(spec), initial = await row(id);
    await spec.trash(db, actor, id, initial.revision);
    const trashed = await row(id);
    await spec.archive(db, actor, id, trashed.revision);
    const result = await row(id);
    expect(result).toMatchObject({ deleted_at: trashed.deleted_at, purge_after: trashed.purge_after, revision: trashed.revision + 1 });
    expect(result.archived_at).not.toBeNull();
  });
}
