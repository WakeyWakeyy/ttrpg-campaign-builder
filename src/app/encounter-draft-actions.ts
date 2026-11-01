"use server";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedEncounter, listEncounterCreatures, EncounterCreatureNotFoundError } from "@/modules/encounters";
import { actionError } from "./action-state";
import { encounterDraftSnapshot, type EncounterDraftTarget } from "./encounter-draft";
import type { PlanningRead } from "./planning-draft-state";
export async function readEncounterDraftAction(id: string, target: EncounterDraftTarget): Promise<PlanningRead> {
  try {
    const db = getDatabase(), actor = await requireActor(db);
    // Parent first: a later child read can only make this revision conservative.
    const parent = await getOwnedEncounter(db, actor, id);
    if (target.kind === "creature") {
      const child = (await listEncounterCreatures(db, actor, id)).find(row => row.id === target.creatureId);
      if (!child) throw new EncounterCreatureNotFoundError();
      return { ok: true, snapshot: encounterDraftSnapshot(parent.revision, target.kind, child, !!parent.deletedAt) };
    }
    if (target.kind !== "encounter" && target.kind !== "new-creature") return { ok: false, message: "Choose an encounter section." };
    return { ok: true, snapshot: encounterDraftSnapshot(parent.revision, target.kind, parent) };
  } catch (error) { return { ok: false, message: actionError(error).message }; }
}
