import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Actor } from "../modules/identity";
import { listOwnedLocations } from "../modules/locations";
import { listOwnedArcs } from "../modules/arcs";
import { listOwnedQuests } from "../modules/quests";
import { listOwnedNpcs } from "../modules/npcs";
import { listOwnedPlayerCharacters } from "../modules/player-characters";
import { listOwnedParties } from "../modules/parties";
import { listOwnedFactions } from "../modules/factions";
import { listOwnedTravelRoutes } from "../modules/travel-routes";
import { listOwnedItems } from "../modules/items";
import { listOwnedEncounters } from "../modules/encounters";

export async function relationshipOptions(db: NodePgDatabase, actor: Actor, campaignId: string) {
  const [locations, arcs, quests, npcs, characters, parties, factions, routes, items, encounters] = await Promise.all([
    listOwnedLocations(db, actor, campaignId), listOwnedArcs(db, actor, campaignId),
    listOwnedQuests(db, actor, campaignId), listOwnedNpcs(db, actor, campaignId),
    listOwnedPlayerCharacters(db, actor, campaignId), listOwnedParties(db, actor, campaignId),
    listOwnedFactions(db, actor, campaignId), listOwnedTravelRoutes(db, actor, campaignId),
    listOwnedItems(db, actor, campaignId),
    listOwnedEncounters(db, actor, campaignId),
  ]);
  return [
    ...locations.map(row => ({ id: row.id, name: row.name, type: "Location", deletedAt: row.deletedAt })),
    ...arcs.map(row => ({ id: row.id, name: row.name, type: "Arc", deletedAt: row.deletedAt })),
    ...quests.map(row => ({ id: row.id, name: row.name, type: "Quest", deletedAt: row.deletedAt })),
    ...npcs.map(row => ({ id: row.id, name: row.name, type: "NPC", deletedAt: row.deletedAt })),
    ...characters.map(row => ({ id: row.id, name: row.name, type: "Player character", deletedAt: row.deletedAt })),
    ...parties.map(row => ({ id: row.id, name: row.name, type: "Party", deletedAt: row.deletedAt })),
    ...factions.map(row => ({ id: row.id, name: row.name, type: "Faction", deletedAt: row.deletedAt })),
    ...routes.map(row => ({ id: row.id, name: row.name, type: "Travel route", deletedAt: row.deletedAt })),
    ...items.map(row => ({ id: row.id, name: row.name, type: "Item", deletedAt: row.deletedAt })),
    ...encounters.map(row => ({ id: row.id, name: row.title, type: "Encounter", deletedAt: row.deletedAt })),
  ];
}
