import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedSecret } from "@/modules/knowledge/secrets";
import { listOwnedClues } from "@/modules/knowledge";
import { listSecretKnowledge } from "@/modules/knowledge/secret-knowledge";
import { listOwnedNpcs } from "@/modules/npcs";
import { listOwnedPlayerCharacters } from "@/modules/player-characters";
import { listOwnedParties } from "@/modules/parties";
import { listOwnedFactions } from "@/modules/factions";
import { ActionForm } from "../../action-form";
import { setSecretKnowledgeAction, updateSecretAction } from "../../actions";
import { readError } from "../../read-error";

export default async function SecretPage({ params }: { params: Promise<{ secretId: string }> }) {
  const { secretId } = await params;
  const { secret, clues, knowledge, holders } = await (async () => {
    const db = getDatabase();
    const actor = await requireActor(db);
    const secret = await getOwnedSecret(db, actor, secretId);
    const [clues, knowledge, npcs, pcs, parties, factions] = await Promise.all([
      listOwnedClues(db, actor, secret.campaignId), listSecretKnowledge(db, actor, secretId),
      listOwnedNpcs(db, actor, secret.campaignId), listOwnedPlayerCharacters(db, actor, secret.campaignId),
      listOwnedParties(db, actor, secret.campaignId), listOwnedFactions(db, actor, secret.campaignId),
    ]);
    const holders = [
      ...npcs.map(row => ({ id: row.id, name: row.name, type: "NPC" })),
      ...pcs.map(row => ({ id: row.id, name: row.name, type: "PLAYER_CHARACTER" })),
      ...parties.map(row => ({ id: row.id, name: row.name, type: "PARTY" })),
      ...factions.map(row => ({ id: row.id, name: row.name, type: "FACTION" })),
    ];
    return { secret, clues, knowledge, holders };
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
    <h2>Who knows this?</h2>
    <p>Only the GM’s recorded state appears here. A linked clue does not automatically give anyone knowledge.</p>
    {knowledge.length ? <ul>{knowledge.map(row => <li key={row.id}>
      {holders.find(holder => holder.id === row.holderId)?.name ?? "Unavailable holder"}: {row.state.toLowerCase()}
      {row.notes && <> — {row.notes}</>}
    </li>)}</ul> : <p>No knowledge states recorded.</p>}
    {!secret.archivedAt && !secret.deletedAt && <ActionForm key={secret.revision} action={setSecretKnowledgeAction.bind(null, secret.id)} reloadLabel="Reload secret">
      <input type="hidden" name="expectedRevision" value={secret.revision} />
      <label htmlFor="knowledge-holder">Character or group</label>
      <select id="knowledge-holder" name="holder" required defaultValue="">
        <option value="" disabled>Choose one</option>
        {holders.filter(holder => !("deletedAt" in holder && holder.deletedAt) && !("archivedAt" in holder && holder.archivedAt))
          .map(holder => <option key={holder.id} value={`${holder.type}:${holder.id}`}>{holder.name} ({holder.type.toLowerCase().replaceAll("_", " ")})</option>)}
      </select>
      <label htmlFor="knowledge-state">Understanding</label>
      <select id="knowledge-state" name="state" defaultValue="KNOWN">
        <option value="SUSPECTED">Suspected</option><option value="PARTIAL">Partial</option>
        <option value="KNOWN">Known</option><option value="NONE">Remove recorded state</option>
      </select>
      <label htmlFor="knowledge-notes">GM notes</label>
      <textarea id="knowledge-notes" name="notes" maxLength={2000} rows={3} />
      <button>Save knowledge state</button>
    </ActionForm>}
  </main>;
}
