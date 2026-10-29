import type { PlanningSnapshot } from "./planning-draft-state";
export function blueprintProposalSnapshot(revision: number, proposal: { name: string; decision: string }, materialized = false): PlanningSnapshot {
  return { revision, unavailable: materialized, values: { name: proposal.name, decision: proposal.decision },
    context: "Only saved accepted proposals appear in the Campaign preview and materialization. Pending local names and decisions are not accepted or merged automatically." };
}
