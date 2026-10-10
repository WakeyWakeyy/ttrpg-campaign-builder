import { and, asc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { campaignEntity, secretKnowledge } from "../../infrastructure/db/schema";
import type { Actor } from "../identity";
import { getOwnedSecret, InvalidSecretInputError, SecretRevisionConflictError } from "./secrets";

export type KnowledgeState = "SUSPECTED" | "PARTIAL" | "KNOWN";
type HolderType = "PLAYER_CHARACTER" | "NPC" | "PARTY" | "FACTION";
const holderTypes: HolderType[] = ["PLAYER_CHARACTER", "NPC", "PARTY", "FACTION"];
const states: KnowledgeState[] = ["SUSPECTED", "PARTIAL", "KNOWN"];
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export async function listSecretKnowledge(db: NodePgDatabase, actor: Actor, secretId: string) {
  await getOwnedSecret(db, actor, secretId);
  return db.select({ id: secretKnowledge.id, holderId: secretKnowledge.holderId,
    holderType: secretKnowledge.holderType, state: secretKnowledge.state, notes: secretKnowledge.notes })
    .from(secretKnowledge).where(eq(secretKnowledge.secretId, secretId)).orderBy(asc(secretKnowledge.id));
}

export async function setSecretKnowledge(db: NodePgDatabase, actor: Actor, secretId: string, input: {
  expectedRevision: number; holderId: string; holderType: HolderType; state: KnowledgeState | "NONE"; notes: string | null;
}) {
  if (!uuid(input.holderId) || !holderTypes.includes(input.holderType) ||
    (input.state !== "NONE" && !states.includes(input.state)) ||
    (input.notes !== null && (typeof input.notes !== "string" || input.notes.length > 2000 || input.notes.includes("\0"))))
    throw new InvalidSecretInputError();
  return db.transaction(async tx => {
    await getOwnedSecret(tx, actor, secretId);
    const [locked] = await tx.select({ id: campaignEntity.id }).from(campaignEntity)
      .where(eq(campaignEntity.id, secretId)).for("update");
    if (!locked) throw new InvalidSecretInputError();
    const current = await getOwnedSecret(tx, actor, secretId);
    if (!Number.isInteger(input.expectedRevision) || current.revision !== input.expectedRevision)
      throw new SecretRevisionConflictError();
    if (current.deletedAt || current.archivedAt) throw new InvalidSecretInputError();
    const [holder] = await tx.select({ id: campaignEntity.id }).from(campaignEntity).where(and(
      eq(campaignEntity.id, input.holderId), eq(campaignEntity.campaignId, current.campaignId),
      eq(campaignEntity.entityType, input.holderType), sql`${campaignEntity.deletedAt} IS NULL`,
      sql`${campaignEntity.archivedAt} IS NULL`));
    if (!holder) throw new InvalidSecretInputError();
    const [existing] = await tx.select().from(secretKnowledge).where(and(
      eq(secretKnowledge.secretId, secretId), eq(secretKnowledge.holderId, input.holderId)));
    const notes = input.notes?.trim() || null;
    if (input.state === "NONE") {
      if (existing) await tx.delete(secretKnowledge).where(eq(secretKnowledge.id, existing.id));
    } else if (existing) {
      if (existing.state !== input.state || existing.notes !== notes)
        await tx.update(secretKnowledge).set({ state: input.state, notes }).where(eq(secretKnowledge.id, existing.id));
    } else await tx.insert(secretKnowledge).values({ campaignId: current.campaignId, secretId,
      holderId: input.holderId, holderType: input.holderType, state: input.state, notes });
    if (existing?.state !== input.state || (input.state !== "NONE" && existing?.notes !== notes))
      await tx.update(campaignEntity).set({ revision: sql`${campaignEntity.revision} + 1`,
        updatedAt: sql`clock_timestamp()` }).where(eq(campaignEntity.id, secretId));
    return getOwnedSecret(tx, actor, secretId);
  });
}
