import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedSecret } from "@/modules/knowledge/secrets";
import { listOwnedClues } from "@/modules/knowledge";
import { ActionForm } from "../../action-form";
import { updateSecretAction } from "../../actions";
import { readError } from "../../read-error";

export default async function SecretPage({ params }: { params: Promise<{ secretId: string }> }) {
  const { secretId } = await params;
  const { secret, clues } = await (async () => {
    const db = getDatabase();
    const actor = await requireActor(db);
    const secret = await getOwnedSecret(db, actor, secretId);
    return { secret, clues: await listOwnedClues(db, actor, secret.campaignId) };
  })().catch(readError);
  return <main>
    <Link href={`/campaigns/${secret.campaignId}#secrets`}>Back to campaign</Link>
    <h1>{secret.title}</h1>
    <p>{secret.deletedAt ? "In trash" : secret.archivedAt ? "Archived" : "Active"}</p>
    {secret.deletedAt && <p>Restore returns this secret to {secret.archivedAt ? "Archived" : "Active"}.</p>}
    <ActionForm key={secret.revision} action={updateSecretAction.bind(null, secret.id)} reloadLabel="Reload secret">
      <input type="hidden" name="expectedRevision" value={secret.revision} />
      <label htmlFor="secret-title">Title</label>
      <input id="secret-title" name="title" defaultValue={secret.title} required maxLength={200} readOnly={!!secret.deletedAt} />
      <label htmlFor="secret-content">Hidden information</label>
      <textarea id="secret-content" name="content" defaultValue={secret.content} required maxLength={10000}
        rows={6} readOnly={!!secret.deletedAt} />
      <div className="actions">
        {!secret.deletedAt && <button name="intent" value="save">Save secret</button>}
        {!secret.deletedAt && !secret.archivedAt && <button name="intent" value="archive" formNoValidate>Archive</button>}
        {!secret.deletedAt && secret.archivedAt && <button name="intent" value="unarchive" formNoValidate>Return to active</button>}
        {!secret.deletedAt && <button name="intent" value="trash" formNoValidate>Trash</button>}
        {secret.deletedAt && <button name="intent" value="restore" formNoValidate>Restore</button>}
      </div>
    </ActionForm>
    <h2>Related clues</h2>
    {clues.some(clue => clue.secretId === secret.id) ? <ul>{clues.filter(clue => clue.secretId === secret.id)
      .map(clue => <li key={clue.id}><Link href={`/clues/${clue.id}`}>{clue.title}</Link></li>)}</ul>
      : <p>No clues linked yet.</p>}
  </main>;
}
