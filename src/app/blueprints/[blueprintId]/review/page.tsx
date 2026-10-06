import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { BlueprintNotFoundError, getBlueprintReview } from "@/modules/blueprints";
import { ActionForm } from "../../../action-form";
import { decideBlueprintProposalAction, materializeBlueprintAction } from "../../../actions";

export default async function BlueprintReviewPage({ params }: { params: Promise<{ blueprintId: string }> }) {
  const { blueprintId } = await params;
  const db = getDatabase();
  const actor = await requireActor(db);
  let review;
  try { review = await getBlueprintReview(db, actor, blueprintId); }
  catch (error) { if (error instanceof BlueprintNotFoundError) notFound(); throw error; }
  const { draft, proposals, materialization } = review;
  if (!draft.reviewStartedAt) notFound();
  const accepted = proposals.filter(proposal => proposal.decision === "ACCEPTED");
  return <main>
    <Link href={`/blueprints/${draft.id}`}>Back to draft</Link>
    <h1>Review {draft.title}</h1>
    <p>Choose each Location separately. Rejected and pending proposals stay in this review and will not become Campaign Locations.</p>
    {proposals.length ? <ol>{proposals.map(proposal => <li key={proposal.id}>
      {materialization ? <p>{proposal.name} — {proposal.decision.toLowerCase()}</p> :
        <ActionForm action={decideBlueprintProposalAction.bind(null, draft.id, proposal.id)} reloadLabel="Reload review">
          <input type="hidden" name="expectedRevision" value={draft.revision} />
          <label htmlFor={`name-${proposal.id}`}>Location name</label>
          <input id={`name-${proposal.id}`} name="name" defaultValue={proposal.name} required maxLength={200} />
          <label htmlFor={`decision-${proposal.id}`}>Decision</label>
          <select id={`decision-${proposal.id}`} name="decision" defaultValue={proposal.decision}>
            <option value="PENDING">Pending</option><option value="ACCEPTED">Accept</option><option value="REJECTED">Reject</option>
          </select>
          <button type="submit">Save proposal</button>
        </ActionForm>}
    </li>)}</ol> : <p>This draft has no proposed Locations. You can still create its Campaign.</p>}
    <h2>Campaign preview</h2>
    <p>{draft.title}: {draft.premise}</p>
    <p>{accepted.length} accepted Location{accepted.length === 1 ? "" : "s"}:</p>
    <ul>{accepted.map(proposal => <li key={proposal.id}>{proposal.name}</li>)}</ul>
    {materialization ? <p>Campaign created. <Link href={`/campaigns/${materialization.campaignId}`}>Open Campaign</Link></p> :
      <ActionForm action={materializeBlueprintAction.bind(null, draft.id)} reloadLabel="Reload review">
        <input type="hidden" name="expectedRevision" value={draft.revision} />
        <input type="hidden" name="idempotencyKey" value={randomUUID()} />
        <button type="submit">Create Campaign from accepted proposals</button>
      </ActionForm>}
  </main>;
}
