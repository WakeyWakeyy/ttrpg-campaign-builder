import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedCampaign, getOwnedCompass } from "@/modules/campaigns";
import { listOwnedLocations } from "@/modules/locations";
import { listOwnedArcs } from "@/modules/arcs";
import { listOwnedQuests } from "@/modules/quests";
import { listOwnedNpcs } from "@/modules/npcs";
import { listOwnedPlayerCharacters } from "@/modules/player-characters";
import { listOwnedParties, listPartyMemberIds } from "@/modules/parties";
import { ActionForm } from "../../action-form";
import { createArcAction, createLocationAction, createNpcAction, createPartyAction, createPlayerCharacterAction, createQuestAction, editCompassAction } from "../../actions";
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
    const arcs = await listOwnedArcs(db, actor, campaignId);
    const quests = await listOwnedQuests(db, actor, campaignId);
    const npcs = await listOwnedNpcs(db, actor, campaignId);
    const characters = await listOwnedPlayerCharacters(db, actor, campaignId);
    const parties = await listOwnedParties(db, actor, campaignId);
    const partyMembers = await Promise.all(parties.map(party => listPartyMemberIds(db, actor, party.id)));
    return { campaign, compass, locations, arcs, quests, npcs, characters, parties, partyMembers };
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
        <a href="#locations">Locations</a>
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
          {data.parties.length ? <ul className="workspace-location-list">{data.parties.map((party, index) => <li key={party.id}>
            <Link href={`/parties/${party.id}`}>{party.name}</Link> · {data.partyMembers[index].length} members
            {data.partyMembers[index].length ? ` · ${data.partyMembers[index].map(id => characterNames.get(id) ?? "Unknown character").join(", ")}` : ""}
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
      </div>
    </div>
  </main>;
}
