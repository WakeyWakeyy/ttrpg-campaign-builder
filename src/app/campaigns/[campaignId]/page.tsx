import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedCampaign, getOwnedCompass } from "@/modules/campaigns";
import { listOwnedLocations } from "@/modules/locations";
import { listOwnedTravelRoutes } from "@/modules/travel-routes";
import { listOwnedItems } from "@/modules/items";
import { listOwnedArcs } from "@/modules/arcs";
import { listOwnedQuests } from "@/modules/quests";
import { listOwnedNpcs } from "@/modules/npcs";
import { listOwnedPlayerCharacters } from "@/modules/player-characters";
import { listOwnedParties, listCampaignPartyMemberIds } from "@/modules/parties";
import { listOwnedFactions } from "@/modules/factions";
import { ActionForm } from "../../action-form";
import { createArcAction, createFactionAction, createItemAction, createLocationAction, createNpcAction, createPartyAction, createPlayerCharacterAction, createQuestAction, createTravelRouteAction, editCompassAction } from "../../actions";
import { LocationStatus } from "../../location-status";
import { ArcStatus } from "../../arc-status";
import { readError } from "../../read-error";

export default async function CampaignPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const data = await (async () => {
    const db = getDatabase();
    const actor = await requireActor(db);
    const campaign = await getOwnedCampaign(db, actor, campaignId);
    const compass = await getOwnedCompass(db, actor, campaignId);
    const locations = await listOwnedLocations(db, actor, campaignId);
    const routes = await listOwnedTravelRoutes(db, actor, campaignId);
    const items = await listOwnedItems(db, actor, campaignId);
    const arcs = await listOwnedArcs(db, actor, campaignId);
    const quests = await listOwnedQuests(db, actor, campaignId);
    const npcs = await listOwnedNpcs(db, actor, campaignId);
    const characters = await listOwnedPlayerCharacters(db, actor, campaignId);
    const parties = await listOwnedParties(db, actor, campaignId);
    const factions = await listOwnedFactions(db, actor, campaignId);
    const partyMembers = await listCampaignPartyMemberIds(db, actor, campaignId);
    return { campaign, compass, locations, routes, items, arcs, quests, npcs, characters, parties, partyMembers, factions };
  })().catch(readError);
  const activeArcs = data.arcs.filter(arc => !arc.deletedAt && !arc.archivedAt).length;
  const activeQuests = data.quests.filter(quest => !quest.deletedAt && !quest.archivedAt).length;
  const activeNpcs = data.npcs.filter(npc => !npc.deletedAt && !npc.archivedAt).length;
  const activeCharacters = data.characters.filter(character => !character.deletedAt && !character.archivedAt).length;
  const characterNames = new Map(data.characters.map(character => [character.id, character.name]));
  const activeLocations = data.locations.filter(location => !location.deletedAt && !location.archivedAt).length;
  const archivedLocations = data.locations.filter(location => !location.deletedAt && location.archivedAt).length;
  const trashedLocations = data.locations.filter(location => location.deletedAt).length;
  const campaignStatus = data.campaign.deletedAt ? "In trash" : data.campaign.archivedAt ? "Archived" : "Active";
  return <main className="workspace-page">
    <Link href="/">All campaigns</Link>
    <div className="workspace-heading">
      <div>
        <p className="workspace-eyebrow">Campaign workspace</p>
        <h1>{data.campaign.name}</h1>
        {data.campaign.description && <p>{data.campaign.description}</p>}
      </div>
      <span className="status">{campaignStatus}</span>
    </div>
    <div className="workspace-layout">
      <nav className="workspace-nav" aria-label="Campaign sections">
        <h2>In this campaign</h2>
        <a href="#overview">Overview</a>
        <a href="#compass">Campaign Compass</a>
        <a href="#arcs">Arcs</a>
        <a href="#quests">Quests</a>
        <a href="#npcs">NPCs</a>
        <a href="#player-characters">Player Characters</a>
        <a href="#parties">Parties</a>
        <a href="#factions">Factions</a>
        <a href="#locations">Locations</a>
        <a href="#travel-routes">Travel routes</a>
        <a href="#items">Items</a>
      </nav>
      <div className="workspace-content">
        <section id="overview" aria-labelledby="overview-heading" className="workspace-section">
          <h2 id="overview-heading">Overview</h2>
          <p>Keep the campaign&apos;s direction, story arcs, and places together as it grows.</p>
          <dl className="workspace-stats">
            <div><dt>Active arcs</dt><dd>{activeArcs}</dd></div>
            <div><dt>Active quests</dt><dd>{activeQuests}</dd></div>
            <div><dt>Active NPCs</dt><dd>{activeNpcs}</dd></div>
            <div><dt>Active player characters</dt><dd>{activeCharacters}</dd></div>
            <div><dt>Active locations</dt><dd>{activeLocations}</dd></div>
            <div><dt>Archived locations</dt><dd>{archivedLocations}</dd></div>
            <div><dt>Locations in trash</dt><dd>{trashedLocations}</dd></div>
          </dl>
        </section>
        <section id="compass" aria-labelledby="compass-heading" className="workspace-section">
          <h2 id="compass-heading">Campaign Compass</h2>
          <h3>Original premise</h3><p className="preserve-lines">{data.compass.originalPremise}</p>
          {data.compass.originalNotes && <><h3>Original notes</h3><p className="preserve-lines">{data.compass.originalNotes}</p></>}
          <ActionForm action={editCompassAction.bind(null, campaignId)} reloadLabel="Reload compass">
            <input type="hidden" name="expectedRevision" value={data.compass.revision} />
            <label htmlFor="currentPremise">Current premise</label><textarea id="currentPremise" name="currentPremise" defaultValue={data.compass.currentPremise} rows={5} required />
            <label htmlFor="setting">Setting (optional)</label><input id="setting" name="setting" defaultValue={data.compass.setting ?? ""} />
            <label htmlFor="tone">Tone (optional)</label><input id="tone" name="tone" defaultValue={data.compass.tone ?? ""} />
            <button type="submit">Save compass</button>
          </ActionForm>
        </section>
        <section id="arcs" aria-labelledby="arcs-heading" className="workspace-section">
          <h2 id="arcs-heading">Arcs</h2>
          <p>Group long-running story threads and connect them to quests.</p>
          {data.arcs.length ? <ul className="workspace-location-list">{data.arcs.map(arc => <li key={arc.id}>
            <Link href={`/arcs/${arc.id}`}>{arc.name}</Link>{" "}<ArcStatus arc={arc} />
          </li>)}</ul> : <p>No arcs yet.</p>}
          <h3>Create arc</h3>
          <ActionForm action={createArcAction.bind(null, campaignId)}>
            <label htmlFor="arc-name">Name</label><input id="arc-name" name="name" required />
            <label htmlFor="arc-description">Description (optional)</label><textarea id="arc-description" name="description" rows={5} />
            <button type="submit">Create arc</button>
          </ActionForm>
        </section>
        <section id="quests" aria-labelledby="quests-heading" className="workspace-section">
          <h2 id="quests-heading">Quests</h2>
          <p>Track goals and plot threads as the story changes.</p>
          {data.quests.length ? <ul className="workspace-location-list">{data.quests.map(quest => <li key={quest.id}>
            <Link href={`/quests/${quest.id}`}>{quest.name}</Link> · {quest.status.toLowerCase()}
            {quest.deletedAt ? " · Trashed" : quest.archivedAt ? " · Archived" : ""}
          </li>)}</ul> : <p>No quests yet.</p>}
          <h3>Create quest</h3>
          <ActionForm action={createQuestAction.bind(null, campaignId)}>
            <label htmlFor="quest-name">Name</label><input id="quest-name" name="name" required />
            <label htmlFor="quest-description">Description (optional)</label><textarea id="quest-description" name="description" rows={5} />
            <input type="hidden" name="status" value="OPEN" />
            <label htmlFor="quest-parent">Parent quest (optional)</label>
            <select id="quest-parent" name="parentQuestId"><option value="">None</option>{data.quests.filter(quest => !quest.deletedAt).map(quest => <option key={quest.id} value={quest.id}>{quest.name}</option>)}</select>
            <fieldset><legend>Arcs (optional)</legend>{data.arcs.filter(arc => !arc.deletedAt).map(arc => <label key={arc.id}><input type="checkbox" name="arcIds" value={arc.id} /> {arc.name}</label>)}</fieldset>
            <button type="submit">Create quest</button>
          </ActionForm>
        </section>
        <section id="npcs" aria-labelledby="npcs-heading" className="workspace-section">
          <h2 id="npcs-heading">NPCs</h2>
          <p>Keep track of the people the GM controls and their current place in the story.</p>
          {data.npcs.length ? <ul className="workspace-location-list">{data.npcs.map(npc => <li key={npc.id}>
            <Link href={`/npcs/${npc.id}`}>{npc.name}</Link>{npc.role ? ` · ${npc.role}` : ""}
            {npc.deletedAt ? " · Trashed" : npc.archivedAt ? " · Archived" : ""}
          </li>)}</ul> : <p>No NPCs yet.</p>}
          <h3>Create NPC</h3>
          <ActionForm action={createNpcAction.bind(null, campaignId)}>
            <label htmlFor="npc-name">Name</label><input id="npc-name" name="name" required />
            <label htmlFor="npc-role">Role (optional)</label><input id="npc-role" name="role" />
            <label htmlFor="npc-description">Description (optional)</label><textarea id="npc-description" name="description" rows={5} />
            <label htmlFor="npc-state">Current state (optional)</label><textarea id="npc-state" name="currentState" rows={4} />
            <button type="submit">Create NPC</button>
          </ActionForm>
        </section>
        <section id="player-characters" aria-labelledby="player-characters-heading" className="workspace-section">
          <h2 id="player-characters-heading">Player Characters</h2>
          <p>Keep campaign details for the characters at the table.</p>
          {data.characters.length ? <ul className="workspace-location-list">{data.characters.map(character => <li key={character.id}>
            <Link href={`/player-characters/${character.id}`}>{character.name}</Link>{character.playerName ? ` · ${character.playerName}` : ""}
            {character.deletedAt ? " · Trashed" : character.archivedAt ? " · Archived" : ""}
          </li>)}</ul> : <p>No player characters yet.</p>}
          <h3>Create player character</h3>
          <ActionForm action={createPlayerCharacterAction.bind(null, campaignId)}>
            <label htmlFor="pc-name">Character name</label><input id="pc-name" name="name" required />
            <label htmlFor="pc-player">Player name (optional)</label><input id="pc-player" name="playerName" />
            <label htmlFor="pc-description">Description (optional)</label><textarea id="pc-description" name="description" rows={4} />
            <label htmlFor="pc-state">Current state (optional)</label><textarea id="pc-state" name="currentState" rows={4} />
            <button type="submit">Create character</button>
          </ActionForm>
        </section>
        <section id="parties" aria-labelledby="parties-heading" className="workspace-section">
          <h2 id="parties-heading">Parties</h2>
          <p>Organize normal groups of player characters. Session attendance is separate.</p>
          {data.parties.length ? <ul className="workspace-location-list">{data.parties.map(party => <li key={party.id}>
            <Link href={`/parties/${party.id}`}>{party.name}</Link> · {(data.partyMembers.get(party.id) ?? []).length} {(data.partyMembers.get(party.id) ?? []).length === 1 ? "member" : "members"}
            {(data.partyMembers.get(party.id) ?? []).length ? ` · ${(data.partyMembers.get(party.id) ?? []).map(id => characterNames.get(id) ?? "Unknown character").join(", ")}` : ""}
            {party.deletedAt ? " · Trashed" : party.archivedAt ? " · Archived" : ""}
          </li>)}</ul> : <p>No parties yet.</p>}
          <h3>Create party</h3>
          <ActionForm action={createPartyAction.bind(null, campaignId)}>
            <label htmlFor="party-name">Name</label><input id="party-name" name="name" required />
            <label htmlFor="party-description">Description (optional)</label><textarea id="party-description" name="description" rows={4} />
            <fieldset><legend>Members</legend>{data.characters.map(character => <label key={character.id}>
              <input type="checkbox" name="playerCharacterIds" value={character.id} /> {character.name}
              {character.deletedAt ? " (in trash)" : character.archivedAt ? " (archived)" : ""}
            </label>)}</fieldset>
            <button type="submit">Create party</button>
          </ActionForm>
        </section>
        <section id="factions" aria-labelledby="factions-heading" className="workspace-section">
          <h2 id="factions-heading">Factions</h2>
          <p>Track organizations and the characters connected to them.</p>
          {data.factions.length ? <ul className="workspace-location-list">{data.factions.map(faction => <li key={faction.id}>
            <Link href={`/factions/${faction.id}`}>{faction.name}</Link>
            {faction.deletedAt ? " · Trashed" : faction.archivedAt ? " · Archived" : ""}
          </li>)}</ul> : <p>No factions yet.</p>}
          <h3>Create faction</h3>
          <ActionForm action={createFactionAction.bind(null, campaignId)}>
            <label htmlFor="faction-name">Name</label><input id="faction-name" name="name" required />
            <label htmlFor="faction-description">Description (optional)</label><textarea id="faction-description" name="description" rows={4} />
            <label htmlFor="faction-purpose">Purpose (optional)</label><textarea id="faction-purpose" name="purpose" rows={3} />
            <label htmlFor="faction-state">Current state (optional)</label><textarea id="faction-state" name="currentState" rows={3} />
            <button type="submit">Create faction</button>
          </ActionForm>
        </section>
        <section id="locations" aria-labelledby="locations-heading" className="workspace-section">
          <h2 id="locations-heading">Locations</h2>
          {data.locations.length ? <ul className="workspace-location-list">{data.locations.map(location => <li key={location.id}>
            <Link href={`/locations/${location.id}`}>{location.name}</Link>{" "}<LocationStatus location={location} />
          </li>)}</ul> : <p>No locations yet. Add the first place your players might visit.</p>}
          <h3>Create location</h3>
          <ActionForm action={createLocationAction.bind(null, campaignId)}>
            <label htmlFor="name">Name</label><input id="name" name="name" required />
            <label htmlFor="description">Description (optional)</label><textarea id="description" name="description" rows={5} />
            <button type="submit">Create location</button>
          </ActionForm>
        </section>
        <section id="travel-routes" aria-labelledby="travel-routes-heading" className="workspace-section">
          <h2 id="travel-routes-heading">Travel routes</h2>
          <p>Connect two locations and keep travel details close to the campaign.</p>
          {data.routes.length ? <ul className="workspace-location-list">{data.routes.map(route => <li key={route.id}>
            <Link href={`/travel-routes/${route.id}`}>{route.name}</Link> · {data.locations.find(place => place.id === route.fromLocationId)?.name ?? "Unknown"} → {data.locations.find(place => place.id === route.toLocationId)?.name ?? "Unknown"}
            {route.deletedAt ? " · Trashed" : route.archivedAt ? " · Archived" : ""}
          </li>)}</ul> : <p>No travel routes yet.</p>}
          <h3>Create travel route</h3>
          <ActionForm action={createTravelRouteAction.bind(null, campaignId)}>
            <label htmlFor="route-name">Name</label><input id="route-name" name="name" required />
            <label htmlFor="route-from">From</label><select id="route-from" name="fromLocationId" required><option value="">Choose location</option>{data.locations.filter(place => !place.deletedAt).map(place => <option key={place.id} value={place.id}>{place.name}</option>)}</select>
            <label htmlFor="route-to">To</label><select id="route-to" name="toLocationId" required><option value="">Choose location</option>{data.locations.filter(place => !place.deletedAt).map(place => <option key={place.id} value={place.id}>{place.name}</option>)}</select>
            <label htmlFor="route-distance">Distance (optional)</label><input id="route-distance" name="distance" />
            <label htmlFor="route-duration">Duration (optional)</label><input id="route-duration" name="duration" />
            <label htmlFor="route-mode">Travel mode (optional)</label><input id="route-mode" name="mode" />
            <label htmlFor="route-hazards">Hazards (optional)</label><textarea id="route-hazards" name="hazards" rows={3} />
            <label htmlFor="route-notes">GM notes (optional)</label><textarea id="route-notes" name="notes" rows={4} />
            <button type="submit">Create route</button>
          </ActionForm>
        </section>
        <section id="items" aria-labelledby="items-heading" className="workspace-section">
          <h2 id="items-heading">Items</h2>
          <p>Track important objects and where they are now.</p>
          {data.items.length ? <ul className="workspace-location-list">{data.items.map(item => <li key={item.id}>
            <Link href={`/items/${item.id}`}>{item.name}</Link>
            {item.deletedAt ? " · Trashed" : item.archivedAt ? " · Archived" : ""}
          </li>)}</ul> : <p>No items yet.</p>}
          <h3>Create item</h3>
          <ActionForm action={createItemAction.bind(null, campaignId)}>
            <label htmlFor="item-name">Name</label><input id="item-name" name="name" required />
            <label htmlFor="item-description">Description (optional)</label><textarea id="item-description" name="description" rows={4} />
            <label htmlFor="item-significance">Significance (optional)</label><textarea id="item-significance" name="significance" rows={3} />
            <label htmlFor="item-state">Current state (optional)</label><textarea id="item-state" name="currentState" rows={3} />
            <label htmlFor="item-locator">Current holder or location</label>
            <select id="item-locator" name="locator"><option value="">Unknown</option>
              <optgroup label="Locations">{data.locations.filter(place => !place.deletedAt).map(place => <option key={place.id} value={`location:${place.id}`}>{place.name}</option>)}</optgroup>
              <optgroup label="NPCs">{data.npcs.filter(npc => !npc.deletedAt).map(npc => <option key={npc.id} value={`npc:${npc.id}`}>{npc.name}</option>)}</optgroup>
              <optgroup label="Player characters">{data.characters.filter(character => !character.deletedAt).map(character => <option key={character.id} value={`pc:${character.id}`}>{character.name}</option>)}</optgroup>
            </select>
            <label htmlFor="item-notes">GM notes (optional)</label><textarea id="item-notes" name="notes" rows={4} />
            <button type="submit">Create item</button>
          </ActionForm>
        </section>
      </div>
    </div>
  </main>;
}
