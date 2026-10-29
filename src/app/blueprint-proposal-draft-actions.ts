"use server";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { BlueprintNotFoundError, getBlueprintReview } from "@/modules/blueprints";
import { actionError } from "./action-state";
import { blueprintProposalSnapshot } from "./blueprint-proposal-draft";
import type { PlanningRead } from "./planning-draft-state";
export async function readBlueprintProposalDraftAction(id: string, proposalId: string): Promise<PlanningRead> {
  try {
    const db = getDatabase(), actor = await requireActor(db);
    // getBlueprintReview reads the owner-scoped parent before its proposals.
    const { draft, proposals, materialization } = await getBlueprintReview(db, actor, id);
    const proposal = proposals.find(row => row.id === proposalId);
    if (!draft.reviewStartedAt || !proposal) throw new BlueprintNotFoundError();
    return { ok: true, snapshot: blueprintProposalSnapshot(draft.revision, proposal, !!materialization) };
  } catch (error) { return { ok: false, message: actionError(error).message }; }
}
