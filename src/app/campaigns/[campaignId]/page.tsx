import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedCampaign, getOwnedCompass } from "@/modules/campaigns";
import { listOwnedLocations } from "@/modules/locations";
import { ActionForm } from "../../action-form";
import { createLocationAction, editCompassAction } from "../../actions";
import { LocationStatus } from "../../location-status";
import { readError } from "../../read-error";

export default async function CampaignPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const data = await (async () => {
    const db = getDatabase();
    const actor = await requireActor(db);
    const campaign = await getOwnedCampaign(db, actor, campaignId);
    const compass = await getOwnedCompass(db, actor, campaignId);
    const locations = await listOwnedLocations(db, actor, campaignId);
    return { campaign, compass, locations };
  })().catch(readError);
  return <main>
    <Link href="/">All campaigns</Link>
    <h1>{data.campaign.name}</h1>
    <section aria-labelledby="compass-heading">
      <h2 id="compass-heading">Campaign Compass</h2>
      <h3>Original premise</h3><p style={{ whiteSpace: "pre-wrap" }}>{data.compass.originalPremise}</p>
      {data.compass.originalNotes && <><h3>Original notes</h3><p style={{ whiteSpace: "pre-wrap" }}>{data.compass.originalNotes}</p></>}
      <ActionForm action={editCompassAction.bind(null, campaignId)} reloadLabel="Reload compass">
        <input type="hidden" name="expectedRevision" value={data.compass.revision} />
        <label htmlFor="currentPremise">Current premise</label><textarea id="currentPremise" name="currentPremise" defaultValue={data.compass.currentPremise} rows={5} required />
        <label htmlFor="setting">Setting (optional)</label><input id="setting" name="setting" defaultValue={data.compass.setting ?? ""} />
        <label htmlFor="tone">Tone (optional)</label><input id="tone" name="tone" defaultValue={data.compass.tone ?? ""} />
        <button type="submit">Save compass</button>
      </ActionForm>
    </section>
    <h2>Locations</h2>
    {data.locations.length ? <ul>{data.locations.map(location => <li key={location.id}>
      <Link href={`/locations/${location.id}`}>{location.name}</Link>{" "}<LocationStatus location={location} />
    </li>)}</ul> : <p>No locations yet.</p>}
    <h2>Create location</h2>
    <ActionForm action={createLocationAction.bind(null, campaignId)}>
      <label htmlFor="name">Name</label><input id="name" name="name" required />
      <label htmlFor="description">Description (optional)</label><textarea id="description" name="description" rows={5} />
      <button type="submit">Create location</button>
    </ActionForm>
  </main>;
}
