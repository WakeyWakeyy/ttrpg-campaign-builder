import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedCampaign } from "@/modules/campaigns";
import { listOwnedLocations } from "@/modules/locations";
import { ActionForm } from "../../action-form";
import { createLocationAction } from "../../actions";
import { LocationStatus } from "../../location-status";
import { readError } from "../../read-error";

export default async function CampaignPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const data = await (async () => {
    const db = getDatabase();
    const actor = await requireActor(db);
    const campaign = await getOwnedCampaign(db, actor, campaignId);
    const locations = await listOwnedLocations(db, actor, campaignId);
    return { campaign, locations };
  })().catch(readError);
  return <main>
    <Link href="/">All campaigns</Link>
    <h1>{data.campaign.name}</h1>
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
