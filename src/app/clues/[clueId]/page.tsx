import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedClue } from "@/modules/knowledge";
import { listOwnedSecrets } from "@/modules/knowledge/secrets";
import { listOwnedLocations } from "@/modules/locations";
import { ActionForm } from "../../action-form";
import { updateClueAction } from "../../actions";
import { readError } from "../../read-error";

export default async function CluePage({ params }: { params: Promise<{ clueId: string }> }) {
  const { clueId } = await params;
  const { clue, locations, secrets } = await (async () => {
    const db = getDatabase();
    const actor = await requireActor(db);
    const clue = await getOwnedClue(db, actor, clueId);
    return { clue, locations: await listOwnedLocations(db, actor, clue.campaignId),
      secrets: await listOwnedSecrets(db, actor, clue.campaignId) };
  })().catch(readError);
  const location = locations.find(item => item.id === clue.discoveryLocationId);
  return <main>
    <Link href={`/campaigns/${clue.campaignId}#clues`}>Back to campaign</Link>
    <h1>{clue.title}</h1>
    <p>{clue.deletedAt ? "In trash" : clue.archivedAt ? "Archived" : "Active"}</p>
    {clue.deletedAt && <p>Restore returns this clue to {clue.archivedAt ? "Archived" : "Active"}.</p>}
    <p>The discovery location is a planned route. The GM decides what the players can actually learn.</p>
    <ActionForm key={clue.revision} action={updateClueAction.bind(null, clue.id)} reloadLabel="Reload clue">
      <input type="hidden" name="expectedRevision" value={clue.revision} />
      <label htmlFor="clue-title">Clue</label>
      <input id="clue-title" name="title" defaultValue={clue.title} required maxLength={200} readOnly={!!clue.deletedAt} />
      <label htmlFor="clue-secret">Hidden information it reveals</label>
      <textarea id="clue-secret" name="secret" defaultValue={clue.secret} required maxLength={10000}
        rows={5} readOnly={!!clue.deletedAt} />
      <label htmlFor="clue-linked-secret">Related secret (optional)</label>
      {clue.deletedAt ? <p>{secrets.find(item => item.id === clue.secretId)?.title ?? "No related secret"}</p> :
        <select id="clue-linked-secret" name="secretId" defaultValue={clue.secretId ?? ""}>
          <option value="">No related secret</option>
          {secrets.filter(item => !item.archivedAt && !item.deletedAt || item.id === clue.secretId)
            .map(item => <option key={item.id} value={item.id}>{item.title}
              {item.archivedAt || item.deletedAt ? " (unavailable)" : ""}</option>)}
        </select>}
      <label htmlFor="clue-location">Discovery location (optional)</label>
      {clue.deletedAt ? <p>{location?.name ?? "No location recorded"}</p> :
        <select id="clue-location" name="discoveryLocationId" defaultValue={clue.discoveryLocationId ?? ""}>
          <option value="">No location recorded</option>
          {locations.filter(item => !item.archivedAt && !item.deletedAt || item.id === clue.discoveryLocationId)
            .map(item => <option key={item.id} value={item.id}>{item.name}
              {item.archivedAt || item.deletedAt ? " (unavailable)" : ""}</option>)}
        </select>}
      <div className="actions">
        {!clue.deletedAt && <button name="intent" value="save">Save clue</button>}
        {!clue.deletedAt && !clue.archivedAt && <button name="intent" value="archive" formNoValidate>Archive</button>}
        {!clue.deletedAt && clue.archivedAt && <button name="intent" value="unarchive" formNoValidate>Return to active</button>}
        {!clue.deletedAt && <button name="intent" value="trash" formNoValidate>Trash</button>}
        {clue.deletedAt && <button name="intent" value="restore" formNoValidate>Restore</button>}
      </div>
    </ActionForm>
  </main>;
}
