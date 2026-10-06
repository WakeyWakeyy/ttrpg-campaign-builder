import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedItem } from "@/modules/items";
import { listOwnedLocations } from "@/modules/locations";
import { listOwnedNpcs } from "@/modules/npcs";
import { listOwnedPlayerCharacters } from "@/modules/player-characters";
import { ActionForm } from "../../action-form";
import { updateItemAction } from "../../actions";
import { readError } from "../../read-error";

export default async function ItemPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const { item, locations, npcs, characters } = await (async () => {
    const db = getDatabase();
    const actor = await requireActor(db);
    const item = await getOwnedItem(db, actor, itemId);
    const [locations, npcs, characters] = await Promise.all([
      listOwnedLocations(db, actor, item.campaignId), listOwnedNpcs(db, actor, item.campaignId),
      listOwnedPlayerCharacters(db, actor, item.campaignId),
    ]);
    return { item, locations, npcs, characters };
  })().catch(readError);
  const locator = item.locationId ? `location:${item.locationId}` : item.npcHolderId ? `npc:${item.npcHolderId}`
    : item.playerCharacterHolderId ? `pc:${item.playerCharacterHolderId}` : "";
  return <main>
    <Link href={`/campaigns/${item.campaignId}#items`}>Back to campaign items</Link>
    <h1>{item.name}</h1>
    <p>{item.deletedAt ? "In trash" : item.archivedAt ? "Archived" : "Active"}</p>
    {item.deletedAt && <p>Restore returns this item to {item.archivedAt ? "Archived" : "Active"}.</p>}
    <ActionForm key={item.revision} action={updateItemAction.bind(null, item.id)} reloadLabel="Reload item">
      <input type="hidden" name="expectedRevision" value={item.revision} />
      <label htmlFor="item-name">Name</label><input id="item-name" name="name" defaultValue={item.name} required readOnly={!!item.deletedAt} />
      <label htmlFor="item-description">Description</label><textarea id="item-description" name="description" defaultValue={item.description ?? ""} rows={5} readOnly={!!item.deletedAt} />
      <label htmlFor="item-significance">Significance</label><textarea id="item-significance" name="significance" defaultValue={item.significance ?? ""} rows={3} readOnly={!!item.deletedAt} />
      <label htmlFor="item-state">Current state</label><textarea id="item-state" name="currentState" defaultValue={item.currentState ?? ""} rows={3} readOnly={!!item.deletedAt} />
      <label htmlFor="item-locator">Current holder or location</label>
      <select id="item-locator" name="locator" defaultValue={locator} disabled={!!item.deletedAt}>
        <option value="">Unknown</option>
        <optgroup label="Locations">{locations.filter(place => !place.deletedAt || place.id === item.locationId).map(place => <option key={place.id} value={`location:${place.id}`}>{place.name}</option>)}</optgroup>
        <optgroup label="NPCs">{npcs.filter(npc => !npc.deletedAt || npc.id === item.npcHolderId).map(npc => <option key={npc.id} value={`npc:${npc.id}`}>{npc.name}</option>)}</optgroup>
        <optgroup label="Player characters">{characters.filter(character => !character.deletedAt || character.id === item.playerCharacterHolderId).map(character => <option key={character.id} value={`pc:${character.id}`}>{character.name}</option>)}</optgroup>
      </select>
      <label htmlFor="item-notes">GM notes</label><textarea id="item-notes" name="notes" defaultValue={item.notes ?? ""} rows={5} readOnly={!!item.deletedAt} />
      <div className="actions">
        {!item.deletedAt && <button name="intent" value="save">Save item</button>}
        {!item.deletedAt && !item.archivedAt && <button name="intent" value="archive" formNoValidate>Archive</button>}
        {!item.deletedAt && <button name="intent" value="trash" formNoValidate>Trash</button>}
        {item.deletedAt && <button name="intent" value="restore" formNoValidate>Restore</button>}
      </div>
    </ActionForm>
  </main>;
}
