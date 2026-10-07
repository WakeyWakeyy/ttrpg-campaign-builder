import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedRelationship } from "@/modules/relationships";
import { ActionForm } from "../../action-form";
import { updateRelationshipAction } from "../../actions";
import { readError } from "../../read-error";
import { relationshipOptions } from "../../relationship-options";

export default async function RelationshipPage({ params }: { params: Promise<{ relationshipId: string }> }) {
  const { relationshipId } = await params;
  const { relationship, choices } = await (async () => {
    const db = getDatabase();
    const actor = await requireActor(db);
    const relationship = await getOwnedRelationship(db, actor, relationshipId);
    return { relationship, choices: await relationshipOptions(db, actor, relationship.campaignId) };
  })().catch(readError);
  const available = choices.filter(choice => !choice.deletedAt
    || choice.id === relationship.sourceEntityId || choice.id === relationship.targetEntityId);
  const name = (id: string) => choices.find(choice => choice.id === id)?.name ?? "Unknown";
  return <main>
    <Link href={`/campaigns/${relationship.campaignId}#relationships`}>Back to campaign</Link>
    <h1>{name(relationship.sourceEntityId)} · {relationship.kind} · {name(relationship.targetEntityId)}</h1>
    <p>{relationship.deletedAt ? "In trash" : relationship.archivedAt ? "Archived" : "Active"}</p>
    {relationship.deletedAt && <p>Restore returns this relationship to {relationship.archivedAt ? "Archived" : "Active"}.</p>}
    <ActionForm key={relationship.revision} action={updateRelationshipAction.bind(null, relationship.id)}>
      <input type="hidden" name="expectedRevision" value={relationship.revision} />
      <label htmlFor="relationship-source">From</label>
      <select id="relationship-source" name="sourceEntityId" defaultValue={relationship.sourceEntityId} disabled={!!relationship.deletedAt}>
        {available.map(choice => <option key={choice.id} value={choice.id}>{choice.type}: {choice.name}</option>)}
      </select>
      <label htmlFor="relationship-kind">Relationship</label>
      <input id="relationship-kind" name="kind" defaultValue={relationship.kind} required readOnly={!!relationship.deletedAt} />
      <label htmlFor="relationship-target">To</label>
      <select id="relationship-target" name="targetEntityId" defaultValue={relationship.targetEntityId} disabled={!!relationship.deletedAt}>
        {available.map(choice => <option key={choice.id} value={choice.id}>{choice.type}: {choice.name}</option>)}
      </select>
      <label htmlFor="relationship-description">Details</label>
      <textarea id="relationship-description" name="description" defaultValue={relationship.description ?? ""} rows={4} readOnly={!!relationship.deletedAt} />
      <div className="actions">
        {!relationship.deletedAt && <button name="intent" value="save">Save relationship</button>}
        {!relationship.deletedAt && !relationship.archivedAt && <button name="intent" value="archive" formNoValidate>Archive</button>}
        {!relationship.deletedAt && <button name="intent" value="trash" formNoValidate>Trash</button>}
        {relationship.deletedAt && <button name="intent" value="restore" formNoValidate>Restore</button>}
      </div>
    </ActionForm>
  </main>;
}
