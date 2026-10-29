import type { PlanningSnapshot } from "./planning-draft-state";
export type EncounterDraftTarget = { kind: "encounter" | "new-creature" } | { kind: "creature"; creatureId: string };
type Source = { title?: string; notes?: string | null; partyLevel?: number; partySize?: number;
  name?: string; xp?: number; quantity?: number; deletedAt: Date | null };
export function encounterDraftSnapshot(revision: number, kind: EncounterDraftTarget["kind"], source: Source, parentDeleted = false): PlanningSnapshot {
  return { revision, unavailable: parentDeleted || !!source.deletedAt,
    values: kind === "encounter" ? { title: source.title!, notes: source.notes ?? "", partyLevel: String(source.partyLevel), partySize: String(source.partySize) }
      : kind === "new-creature" ? { name: "", xp: "", quantity: "1" }
      : { name: source.name!, xp: String(source.xp), quantity: String(source.quantity) } };
}
