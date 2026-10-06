import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedParty, listPartyMemberIds } from "@/modules/parties";
import { listOwnedPlayerCharacters } from "@/modules/player-characters";
import { ActionForm } from "../../action-form";
import { updatePartyAction } from "../../actions";
import { EntityStatus } from "../../entity-status";
import { readError } from "../../read-error";

export default async function PartyPage({ params }: { params: Promise<{ partyId: string }> }) {
  const { partyId } = await params;
  const data = await (async () => {
    const db = getDatabase();
    const actor = await requireActor(db);
    const party = await getOwnedParty(db, actor, partyId);
    const members = await listPartyMemberIds(db, actor, partyId);
    const characters = await listOwnedPlayerCharacters(db, actor, party.campaignId);
    return { party, members, characters };
  })().catch(readError);
  const { party, members, characters } = data;
  return <main>
    <Link href={`/campaigns/${party.campaignId}#parties`}>Back to parties</Link>
    <h1>{party.name}</h1>
    <p><EntityStatus entity={party} /></p>
    <p>{members.length} {members.length === 1 ? "member" : "members"}</p>
    {party.deletedAt && <p>Restore returns this party to {party.archivedAt ? "Archived" : "Active"}.</p>}
    <ActionForm key={party.revision} action={updatePartyAction.bind(null, party.id)} reloadLabel="Reload party">
      <input type="hidden" name="expectedRevision" value={party.revision} />
      <label htmlFor="party-name">Name</label><input id="party-name" name="name" defaultValue={party.name} required readOnly={!!party.deletedAt} />
      <label htmlFor="party-description">Description (optional)</label><textarea id="party-description" name="description" defaultValue={party.description ?? ""} rows={6} readOnly={!!party.deletedAt} />
      <fieldset disabled={!!party.deletedAt}><legend>Normal party composition</legend>
        {characters.length ? characters.map(character => <label key={character.id}>
          <input type="checkbox" name="playerCharacterIds" value={character.id} defaultChecked={members.includes(character.id)} /> {character.name}
          {character.deletedAt ? " (in trash)" : character.archivedAt ? " (archived)" : ""}
        </label>) : <p>Create a player character first.</p>}
      </fieldset>
      <p>Session attendance will be tracked separately.</p>
      <div className="actions">
        {!party.deletedAt && <button name="intent" value="save">Save party</button>}
        {!party.deletedAt && !party.archivedAt && <button name="intent" value="archive" formNoValidate>Archive</button>}
        {!party.deletedAt && <button name="intent" value="trash" formNoValidate>Trash</button>}
        {party.deletedAt && <button name="intent" value="restore" formNoValidate>Restore</button>}
      </div>
    </ActionForm>
  </main>;
}
