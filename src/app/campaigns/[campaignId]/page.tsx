import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedCampaign, getOwnedCompass } from "@/modules/campaigns";
import { listOwnedLocations } from "@/modules/locations";
import { listOwnedTravelRoutes } from "@/modules/travel-routes";
import { listOwnedItems } from "@/modules/items";
import { listOwnedRelationships } from "@/modules/relationships";
import { listCampaignTimelineEventLinks, listOwnedTimelineEvents } from "@/modules/timeline";
import { listOwnedSessions } from "@/modules/sessions";
import { listOwnedEncounters } from "@/modules/encounters";
import { listOwnedRewards } from "@/modules/rewards";
import { listRewardGrants } from "@/modules/rewards/grants";
import { getCampaignRulesetVersion, listCampaignRulesReferences } from "@/modules/rulesets";
import { EncounterBudgetCalculator } from "../../encounter-budget-calculator";
import { relationshipOptions } from "../../relationship-options";
import { listOwnedArcs } from "@/modules/arcs";
import { listOwnedQuests } from "@/modules/quests";
import { findQuestContinuityIssues } from "@/modules/intelligence/quest-continuity";
import { findTimelineContinuityIssues } from "@/modules/intelligence/timeline-continuity";
import { listOwnedNpcs } from "@/modules/npcs";
import { listOwnedPlayerCharacters } from "@/modules/player-characters";
import { listOwnedParties, listCampaignPartyMemberIds } from "@/modules/parties";
import { listOwnedFactions } from "@/modules/factions";
import { ActionForm } from "../../action-form";
import { createArcAction, createEncounterAction, createFactionAction, createItemAction, createLocationAction, createNpcAction, createPartyAction, createPlayerCharacterAction, createQuestAction, createRelationshipAction, createRewardAction, createSessionAction, createTimelineEventAction, createTravelRouteAction, editCompassAction } from "../../actions";
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
    const relationships = await listOwnedRelationships(db, actor, campaignId);
    const timeline = await listOwnedTimelineEvents(db, actor, campaignId);
    const timelineLinks = await listCampaignTimelineEventLinks(db, actor, campaignId);
    const sessions = await listOwnedSessions(db, actor, campaignId);
    const encounters = await listOwnedEncounters(db, actor, campaignId);
    const rewards = await listOwnedRewards(db, actor, campaignId);
    const grants = await listRewardGrants(db, actor, campaignId);
    const rulesReferences = await listCampaignRulesReferences(db, actor, campaignId);
    const rulesetVersion = await getCampaignRulesetVersion(db, actor, campaignId);
    const relationshipChoices = await relationshipOptions(db, actor, campaignId);
    const arcs = await listOwnedArcs(db, actor, campaignId);
    const quests = await listOwnedQuests(db, actor, campaignId);
    const npcs = await listOwnedNpcs(db, actor, campaignId);
    const characters = await listOwnedPlayerCharacters(db, actor, campaignId);
    const parties = await listOwnedParties(db, actor, campaignId);
    const factions = await listOwnedFactions(db, actor, campaignId);
    const partyMembers = await listCampaignPartyMemberIds(db, actor, campaignId);
    return { campaign, compass, locations, routes, items, relationships, timeline, timelineLinks, sessions, encounters, rewards, grants, rulesReferences, rulesetVersion, relationshipChoices, arcs, quests, npcs, characters, parties, partyMembers, factions };
  })().catch(readError);
  const activeArcs = data.arcs.filter(arc => !arc.deletedAt && !arc.archivedAt).length;
  const timelineChoices = [...data.relationshipChoices, ...data.relationships.map(row => ({
    id: row.id, name: row.kind, type: "Relationship", deletedAt: row.deletedAt,
  }))];
  const activeQuests = data.quests.filter(quest => !quest.deletedAt && !quest.archivedAt).length;
  const continuityFindings = findQuestContinuityIssues(data.quests);
  const timelineFindings = findTimelineContinuityIssues(data.timeline, data.timelineLinks);
  const activeNpcs = data.npcs.filter(npc => !npc.deletedAt && !npc.archivedAt).length;
  const activeCharacters = data.characters.filter(character => !character.deletedAt && !character.archivedAt).length;
  const characterNames = new Map(data.characters.map(character => [character.id, character.name]));
  const activeLocations = data.locations.filter(location => !location.deletedAt && !location.archivedAt).length;
  const archivedLocations = data.locations.filter(location => !location.deletedAt && location.archivedAt).length;
  const trashedLocations = data.locations.filter(location => location.deletedAt).length;
  const campaignStatus = data.campaign.deletedAt ? "In trash" : data.campaign.archivedAt ? "Archived" : "Active";
  const referenceSources = [...Map.groupBy(data.rulesReferences, entry => entry.sourceId).values()];
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
        <a href="#continuity">Continuity</a>
        <a href="#npcs">NPCs</a>
        <a href="#player-characters">Player Characters</a>
        <a href="#parties">Parties</a>
        <a href="#factions">Factions</a>
        <a href="#locations">Locations</a>
        <a href="#travel-routes">Travel routes</a>
        <a href="#items">Items</a>
        <a href="#relationships">Relationships</a>
        <a href="#timeline">Timeline</a>
        <a href="#sessions">Sessions</a>
        <a href="#encounters">Encounters</a>
        <a href="#rewards">Rewards</a>
        <a href="#grant-ledger">Grant ledger</a>
        <a href="#rules-reference">Rules reference</a>
      </nav>
      <div className="workspace-content">
        <section id="rules-reference" aria-labelledby="rules-reference-heading" className="workspace-section">
          <h2 id="rules-reference-heading">Rules reference</h2>
          {referenceSources.length ? <>
            <p>Selected sections from {data.rulesetVersion?.name}, the version pinned to this campaign.</p>
            {referenceSources.map(entries => <div key={entries[0].sourceId}>
              <ul>{entries.map(entry => <li key={entry.key}>
                {entry.category}: <a href={`${entry.sourceUrl}#page=${entry.page}`}>{entry.title}</a> (page {entry.page})
              </li>)}</ul>
              <p>Source: <a href={entries[0].sourceUrl}>{entries[0].sourceTitle}</a> · <a href={entries[0].licenseUrl}>{entries[0].license}</a></p>
              <p>{entries[0].attribution}</p>
            </div>)}
          </> : <p>No reference index is available for this campaign&apos;s ruleset version.</p>}
          {data.rulesetVersion && <EncounterBudgetCalculator rulesetKey={data.rulesetVersion.rulesetKey}
            version={data.rulesetVersion.version} />}
        </section>
        <section id="encounters" aria-labelledby="encounters-heading" className="workspace-section">
          <h2 id="encounters-heading">Encounters</h2>
          <p>Build a combat plan and compare its creature XP with the party budget.</p>
          {data.encounters.length ? <ul>{data.encounters.map(item => <li key={item.id}>
            <Link href={`/encounters/${item.id}`}>{item.title}</Link>
            {item.deletedAt ? " · In trash" : item.archivedAt ? " · Archived" : ""}
          </li>)}</ul> : <p>No encounters yet.</p>}
          {data.rulesetVersion?.rulesetKey === "dnd-5e-2024" && data.rulesetVersion.version === "5.2.1"
            && !data.campaign.deletedAt && <ActionForm action={createEncounterAction.bind(null, campaignId)}>
              <label htmlFor="new-encounter-title">Title</label>
              <input id="new-encounter-title" name="title" required maxLength={200} />
              <label htmlFor="new-encounter-level">Party level</label>
              <input id="new-encounter-level" name="partyLevel" type="number" min="1" max="20" defaultValue="1" required />
              <label htmlFor="new-encounter-size">Number of characters</label>
              <input id="new-encounter-size" name="partySize" type="number" min="1" max="20" defaultValue="4" required />
              <button type="submit">Create encounter</button>
            </ActionForm>}
        </section>
        <section id="rewards" aria-labelledby="rewards-heading" className="workspace-section">
          <h2 id="rewards-heading">Rewards</h2>
          <p>Plan what the party might earn, discover, or gain. Components can be resolved independently.</p>
          {data.rewards.length ? <ul>{data.rewards.map(item => <li key={item.id}>
            <Link href={`/rewards/${item.id}`}>{item.title}</Link>
            {item.deletedAt ? " · In trash" : item.archivedAt ? " · Archived" : ""}
          </li>)}</ul> : <p>No rewards planned yet.</p>}
          {!data.campaign.deletedAt && <ActionForm action={createRewardAction.bind(null, campaignId)}>
            <label htmlFor="new-reward-title">Title</label>
            <input id="new-reward-title" name="title" required maxLength={200} />
            <button type="submit">Plan reward</button>
          </ActionForm>}
        </section>
        <section id="grant-ledger" aria-labelledby="grant-ledger-heading" className="workspace-section">
          <h2 id="grant-ledger-heading">Grant ledger</h2>
          <p>What was actually given, preserved as it was recorded.</p>
          {data.grants.length ? <ol>{data.grants.map(grant => <li key={grant.id}>
            <strong>{grant.rewardTitle}</strong> to {grant.recipient} ·
            <time dateTime={grant.grantedAt.toISOString()}>{grant.grantedAt.toLocaleString("en-US", { timeZone: "UTC" })} UTC</time>
            {grant.sessionId && <span> · {data.sessions.find(session => session.id === grant.sessionId)?.title ?? "Session removed"}</span>}
            <ul>{grant.components.map(component => <li key={component.id}>
              {component.kind.toLowerCase()}: {component.description}</li>)}</ul>
            {grant.notes && <p className="preserve-lines">{grant.notes}</p>}
          </li>)}</ol> : <p>No rewards granted yet.</p>}
        </section>
        <section id="sessions" aria-labelledby="sessions-heading" className="workspace-section">
          <h2 id="sessions-heading">Sessions</h2>
          <p>Prepare the next table session and keep its outcome separate from the plan.</p>
          {data.sessions.length ? <ul className="workspace-location-list">{data.sessions.map(item => <li key={item.id}>
            <Link href={`/sessions/${item.id}`}>{item.title}</Link>{item.plannedFor ? ` · ${item.plannedFor}` : ""}
            {item.deletedAt ? " · Trashed" : item.archivedAt ? " · Archived" : ""}
          </li>)}</ul> : <p>No sessions yet.</p>}
          <h3>Prepare session</h3>
          <ActionForm action={createSessionAction.bind(null, campaignId)}>
            <label htmlFor="new-session-title">Title</label><input id="new-session-title" name="title" required />
            <label htmlFor="new-session-date">Planned date (optional)</label><input id="new-session-date" name="plannedFor" type="date" />
            <label htmlFor="new-session-preparation">Preparation</label><textarea id="new-session-preparation" name="preparation" rows={5} />
            <button type="submit">Create session</button>
          </ActionForm>
        </section>
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
        <section id="continuity" aria-labelledby="continuity-heading" className="workspace-section">
          <h2 id="continuity-heading">Continuity</h2>
          <p>Open or postponed threads beneath a resolved, failed, or abandoned parent may need a second look. These are prompts for the GM, not automatic changes.</p>
          {continuityFindings.length ? <ul>{continuityFindings.map(finding => <li key={finding.questId}>
            <Link href={`/quests/${finding.questId}`}>{finding.questName}</Link> is {finding.questStatus.toLowerCase()} beneath {finding.parentName}.
          </li>)}</ul> : <p>No quest continuity prompts right now.</p>}
          {timelineFindings.length > 0 && <><h3>Dates to review</h3>
            <p>These events share an in-world date and a related entity, but have different real dates. Check whether that is intentional.</p>
            <ul>{timelineFindings.map(finding => <li key={`${finding.firstId}-${finding.secondId}-${finding.entityName}`}>
              <Link href={`/timeline/${finding.firstId}`}>{finding.firstTitle}</Link> and <Link href={`/timeline/${finding.secondId}`}>{finding.secondTitle}</Link> both mention {finding.entityName} on {finding.inWorldDate}.
            </li>)}</ul></>}
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
        <section id="relationships" aria-labelledby="relationships-heading" className="workspace-section">
          <h2 id="relationships-heading">Relationships</h2>
          <p>Connect campaign people, places, stories, and objects with your own terms.</p>
          {data.relationships.length ? <ul className="workspace-location-list">{data.relationships.map(relationship => <li key={relationship.id}>
            <Link href={`/relationships/${relationship.id}`}>
              {data.relationshipChoices.find(choice => choice.id === relationship.sourceEntityId)?.name ?? "Unknown"} · {relationship.kind} · {data.relationshipChoices.find(choice => choice.id === relationship.targetEntityId)?.name ?? "Unknown"}
            </Link>{relationship.deletedAt ? " · Trashed" : relationship.archivedAt ? " · Archived" : ""}
          </li>)}</ul> : <p>No relationships yet.</p>}
          <h3>Create relationship</h3>
          <ActionForm action={createRelationshipAction.bind(null, campaignId)}>
            <label htmlFor="relationship-source">From</label>
            <select id="relationship-source" name="sourceEntityId" required><option value="">Choose entity</option>
              {data.relationshipChoices.filter(choice => !choice.deletedAt).map(choice => <option key={choice.id} value={choice.id}>{choice.type}: {choice.name}</option>)}
            </select>
            <label htmlFor="relationship-kind">Relationship</label><input id="relationship-kind" name="kind" placeholder="protects, owes, knows…" required />
            <label htmlFor="relationship-target">To</label>
            <select id="relationship-target" name="targetEntityId" required><option value="">Choose entity</option>
              {data.relationshipChoices.filter(choice => !choice.deletedAt).map(choice => <option key={choice.id} value={choice.id}>{choice.type}: {choice.name}</option>)}
            </select>
            <label htmlFor="relationship-description">Details (optional)</label><textarea id="relationship-description" name="description" rows={3} />
            <button type="submit">Create relationship</button>
          </ActionForm>
        </section>
        <section id="timeline" aria-labelledby="timeline-heading" className="workspace-section">
          <h2 id="timeline-heading">Timeline</h2>
          <p>Record meaningful events in the campaign story. A real date and an in-world date are both optional.</p>
          {data.timeline.length ? <ul className="workspace-location-list">{data.timeline.map(event => <li key={event.id}>
            <Link href={`/timeline/${event.id}`}>{event.title}</Link>
            {event.inWorldDate ? ` · ${event.inWorldDate}` : event.occurredAt ? ` · ${event.occurredAt.toISOString().slice(0, 10)}` : ""}
            {event.deletedAt ? " · Trashed" : event.archivedAt ? " · Archived" : ""}
          </li>)}</ul> : <p>No timeline events yet.</p>}
          <h3>Record event</h3>
          <ActionForm action={createTimelineEventAction.bind(null, campaignId)}>
            <label htmlFor="timeline-title">Title</label><input id="timeline-title" name="title" required />
            <label htmlFor="timeline-description">What happened (optional)</label><textarea id="timeline-description" name="description" rows={4} />
            <label htmlFor="timeline-occurred">Real date (optional)</label><input id="timeline-occurred" name="occurredOn" type="date" />
            <label htmlFor="timeline-world-date">In-world date (optional)</label><input id="timeline-world-date" name="inWorldDate" />
            <fieldset><legend>Related entities (optional)</legend>{timelineChoices.filter(choice => !choice.deletedAt).map(choice => <label key={choice.id}>
              <input type="checkbox" name="entityIds" value={choice.id} /> {choice.type}: {choice.name}
            </label>)}</fieldset>
            <button type="submit">Record event</button>
          </ActionForm>
        </section>
      </div>
    </div>
  </main>;
}
