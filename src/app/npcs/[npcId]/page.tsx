import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedNpc } from "@/modules/npcs";
import { ActionForm } from "../../action-form";
import { NpcStatus } from "../../npc-status";
import { updateNpcAction } from "../../actions";
import { readError } from "../../read-error";

export default async function NpcPage({ params }: { params: Promise<{ npcId: string }> }) {
  const { npcId } = await params;
  const npc = await (async () => {
    const db = getDatabase();
    return getOwnedNpc(db, await requireActor(db), npcId);
  })().catch(readError);
  return <main>
    <Link href={`/campaigns/${npc.campaignId}#npcs`}>Back to campaign NPCs</Link>
    <h1>{npc.name}</h1>
    <p><NpcStatus npc={npc} /></p>
    {npc.deletedAt && <p>Restore returns this NPC to {npc.archivedAt ? "Archived" : "Active"}.</p>}
    <ActionForm key={npc.revision} action={updateNpcAction.bind(null, npc.id)} reloadLabel="Reload NPC">
      <input type="hidden" name="expectedRevision" value={npc.revision} />
      <label htmlFor="npc-name">Name</label><input id="npc-name" name="name" defaultValue={npc.name} required readOnly={!!npc.deletedAt} />
      <label htmlFor="npc-description">Description</label><textarea id="npc-description" name="description" defaultValue={npc.description ?? ""} rows={8} readOnly={!!npc.deletedAt} />
      <label htmlFor="npc-role">Role</label><input id="npc-role" name="role" defaultValue={npc.role ?? ""} readOnly={!!npc.deletedAt} />
      <label htmlFor="npc-state">Current state</label><textarea id="npc-state" name="currentState" defaultValue={npc.currentState ?? ""} rows={5} readOnly={!!npc.deletedAt} />
      <div className="actions">
        {!npc.deletedAt && <button name="intent" value="save">Save NPC</button>}
        {!npc.deletedAt && !npc.archivedAt && <button name="intent" value="archive" formNoValidate>Archive</button>}
        {!npc.deletedAt && <button name="intent" value="trash" formNoValidate>Trash</button>}
        {npc.deletedAt && <button name="intent" value="restore" formNoValidate>Restore</button>}
      </div>
    </ActionForm>
  </main>;
}
