import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedCampaign, getOwnedCompass } from "@/modules/campaigns";
import { listOwnedLocations } from "@/modules/locations";
import { listOwnedArcs } from "@/modules/arcs";
import { ActionForm } from "../../action-form";
import { createArcAction, createLocationAction, editCompassAction } from "../../actions";
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
    return { campaign, compass, locations, arcs };
  })().catch(readError);
  const activeArcs = data.arcs.filter(arc => !arc.deletedAt && !arc.archivedAt).length;
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
        <a href="#locations">Locations</a>
      </nav>
      <div className="workspace-content">
        <section id="overview" aria-labelledby="overview-heading" className="workspace-section">
          <h2 id="overview-heading">Overview</h2>
          <p>Keep the campaign&apos;s direction, story arcs, and places together as it grows.</p>
          <dl className="workspace-stats">
            <div><dt>Active arcs</dt><dd>{activeArcs}</dd></div>
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
          <p>Group a long-running story thread here. Quests can join arcs when Quest support arrives.</p>
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
