"use server";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedReward, listRewardComponents, RewardComponentNotFoundError } from "@/modules/rewards";
import { actionError } from "./action-state";
import { rewardDraftSnapshot, type RewardDraftTarget } from "./reward-draft";
import type { PlanningRead } from "./planning-draft-state";
export async function readRewardDraftAction(id: string, target: RewardDraftTarget): Promise<PlanningRead> {
  try {
    const db = getDatabase(), actor = await requireActor(db);
    const parent = await getOwnedReward(db, actor, id);
    if (target.kind === "component") {
      const child = (await listRewardComponents(db, actor, id)).find(row => row.id === target.componentId);
      if (!child) throw new RewardComponentNotFoundError();
      return { ok: true, snapshot: rewardDraftSnapshot(parent.revision, target.kind, child, !!parent.deletedAt) };
    }
    if (target.kind !== "reward" && target.kind !== "new-component" && target.kind !== "grant") return { ok: false, message: "Choose a reward section." };
    const snapshot = rewardDraftSnapshot(parent.revision, target.kind, parent);
    if (target.kind === "grant") {
      const components = await listRewardComponents(db, actor, id);
      snapshot.context = "This is a new grant, not a saved outcome. After explicit preparation, a grant uses the current persisted component descriptions: "
        + components.filter(row => !row.deletedAt).map(row => `${row.id}: ${row.kind} — ${row.description}`).join("; ");
    }
    return { ok: true, snapshot };
  } catch (error) { return { ok: false, message: actionError(error).message }; }
}
