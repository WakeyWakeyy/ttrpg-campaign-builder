import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedPlayerCharacter } from "@/modules/player-characters";
import { ActionForm } from "../../action-form";
import { updatePlayerCharacterAction } from "../../actions";
import { EntityStatus } from "../../entity-status";
import { readError } from "../../read-error";

export default async function PlayerCharacterPage({ params }: { params: Promise<{ playerCharacterId: string }> }) {
  const { playerCharacterId } = await params;
  const character = await (async () => {
    const db = getDatabase();
    return getOwnedPlayerCharacter(db, await requireActor(db), playerCharacterId);
  })().catch(readError);
  return <main>
    <Link href={`/campaigns/${character.campaignId}#player-characters`}>Back to player characters</Link>
    <h1>{character.name}</h1>
    <p><EntityStatus entity={character} /></p>
    {character.deletedAt && <p>Restore returns this character to {character.archivedAt ? "Archived" : "Active"}.</p>}
    <ActionForm key={character.revision} action={updatePlayerCharacterAction.bind(null, character.id)} reloadLabel="Reload character">
      <input type="hidden" name="expectedRevision" value={character.revision} />
      <label htmlFor="pc-name">Character name</label><input id="pc-name" name="name" defaultValue={character.name} required readOnly={!!character.deletedAt} />
      <label htmlFor="pc-player">Player name (optional)</label><input id="pc-player" name="playerName" defaultValue={character.playerName ?? ""} readOnly={!!character.deletedAt} />
      <label htmlFor="pc-description">Description (optional)</label><textarea id="pc-description" name="description" defaultValue={character.description ?? ""} rows={6} readOnly={!!character.deletedAt} />
      <label htmlFor="pc-state">Current state (optional)</label><textarea id="pc-state" name="currentState" defaultValue={character.currentState ?? ""} rows={5} readOnly={!!character.deletedAt} />
      <div className="actions">
        {!character.deletedAt && <button name="intent" value="save">Save character</button>}
        {!character.deletedAt && !character.archivedAt && <button name="intent" value="archive" formNoValidate>Archive</button>}
        {!character.deletedAt && <button name="intent" value="trash" formNoValidate>Trash</button>}
        {character.deletedAt && <button name="intent" value="restore" formNoValidate>Restore</button>}
      </div>
    </ActionForm>
  </main>;
}
