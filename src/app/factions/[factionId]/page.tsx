import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedFaction, listFactionMemberships } from "@/modules/factions";
import { listOwnedNpcs } from "@/modules/npcs";
import { listOwnedPlayerCharacters } from "@/modules/player-characters";
import { ActionForm } from "../../action-form";
import { setFactionMembershipAction, updateFactionAction } from "../../actions";
import { EntityStatus } from "../../entity-status";
import { readError } from "../../read-error";

export default async function FactionPage({ params }: { params: Promise<{ factionId: string }> }) {
  const { factionId } = await params;
  const data = await (async () => {
    const db = getDatabase();
    const actor = await requireActor(db);
    const faction = await getOwnedFaction(db, actor, factionId);
    const [memberships, npcs, characters] = await Promise.all([
      listFactionMemberships(db, actor, factionId), listOwnedNpcs(db, actor, faction.campaignId), listOwnedPlayerCharacters(db, actor, faction.campaignId),
    ]);
    return { faction, memberships, npcs, characters };
  })().catch(readError);
  const { faction, memberships, npcs, characters } = data;
  const names = new Map([...npcs, ...characters].map(person => [person.id, person.name]));
  const choices = [
    ...npcs.map(person => ({ value: `NPC:${person.id}`, label: `${person.name} (NPC)` })),
    ...characters.map(person => ({ value: `PLAYER_CHARACTER:${person.id}`, label: `${person.name} (PC)` })),
  ];
  return <main>
    <Link href={`/campaigns/${faction.campaignId}#factions`}>Back to factions</Link>
    <h1>{faction.name}</h1>
    <p><EntityStatus entity={faction} /></p>
    {faction.deletedAt && <p>Restore returns this faction to {faction.archivedAt ? "Archived" : "Active"}.</p>}
    <ActionForm key={faction.revision} action={updateFactionAction.bind(null, faction.id)} reloadLabel="Reload faction">
      <input type="hidden" name="expectedRevision" value={faction.revision} />
      <label htmlFor="faction-name">Name</label><input id="faction-name" name="name" defaultValue={faction.name} required readOnly={!!faction.deletedAt} />
      <label htmlFor="faction-description">Description</label><textarea id="faction-description" name="description" defaultValue={faction.description ?? ""} rows={5} readOnly={!!faction.deletedAt} />
      <label htmlFor="faction-purpose">Purpose</label><textarea id="faction-purpose" name="purpose" defaultValue={faction.purpose ?? ""} rows={3} readOnly={!!faction.deletedAt} />
      <label htmlFor="faction-state">Current state</label><textarea id="faction-state" name="currentState" defaultValue={faction.currentState ?? ""} rows={3} readOnly={!!faction.deletedAt} />
      <div className="actions">
        {!faction.deletedAt && <button name="intent" value="save">Save faction</button>}
        {!faction.deletedAt && !faction.archivedAt && <button name="intent" value="archive" formNoValidate>Archive</button>}
        {!faction.deletedAt && <button name="intent" value="trash" formNoValidate>Trash</button>}
        {faction.deletedAt && <button name="intent" value="restore" formNoValidate>Restore</button>}
      </div>
    </ActionForm>
    <section aria-labelledby="memberships-heading">
      <h2 id="memberships-heading">Members</h2>
      <p>Mark a member as former to keep their place in the faction history.</p>
      {memberships.length ? <ul className="workspace-location-list">{memberships.map(membership => <li key={membership.id}>
        <strong>{names.get(membership.npcId ?? membership.playerCharacterId ?? "") ?? "Unknown member"}</strong> · {membership.status.toLowerCase()}
        {membership.role ? ` · ${membership.role}` : ""}{membership.rank ? ` · ${membership.rank}` : ""}
        {!faction.deletedAt && <ActionForm key={`${membership.id}-${faction.revision}`} action={setFactionMembershipAction.bind(null, faction.id)} reloadLabel="Reload faction">
          <input type="hidden" name="expectedRevision" value={faction.revision} />
          <input type="hidden" name="member" value={`${membership.npcId ? "NPC" : "PLAYER_CHARACTER"}:${membership.npcId ?? membership.playerCharacterId}`} />
          <label>Role <input name="role" defaultValue={membership.role ?? ""} /></label>
          <label>Rank <input name="rank" defaultValue={membership.rank ?? ""} /></label>
          <label>Status <select name="status" defaultValue={membership.status}><option value="ACTIVE">Active</option><option value="FORMER">Former</option></select></label>
          <button type="submit">Save membership</button>
        </ActionForm>}
      </li>)}</ul> : <p>No members yet.</p>}
      {!faction.deletedAt && <><h3>Add member</h3><ActionForm key={faction.revision} action={setFactionMembershipAction.bind(null, faction.id)} reloadLabel="Reload faction">
        <input type="hidden" name="expectedRevision" value={faction.revision} />
        <label htmlFor="faction-member">Character</label><select id="faction-member" name="member" required defaultValue=""><option value="" disabled>Choose a character</option>{choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select>
        <label htmlFor="member-role">Role (optional)</label><input id="member-role" name="role" />
        <label htmlFor="member-rank">Rank (optional)</label><input id="member-rank" name="rank" />
        <input type="hidden" name="status" value="ACTIVE" />
        <button type="submit">Add member</button>
      </ActionForm></>}
    </section>
  </main>;
}
