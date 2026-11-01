import type { PlanningSnapshot } from "./planning-draft-state";
export type RewardDraftTarget = { kind: "reward" | "new-component" | "grant" } | { kind: "component"; componentId: string };
type Source = { title?: string; notes?: string | null; kind?: string; description?: string; deletedAt: Date | null };
export function rewardDraftSnapshot(revision: number, kind: RewardDraftTarget["kind"], source: Source, parentDeleted = false): PlanningSnapshot {
  return { revision, unavailable: parentDeleted || !!source.deletedAt,
    values: kind === "reward" ? { title: source.title!, notes: source.notes ?? "" }
      : kind === "new-component" ? { kind: "MONEY", description: "" }
      : kind === "grant" ? { componentIds: [], recipient: "", sessionId: "", notes: "" }
      : { kind: source.kind!, description: source.description! } };
}
