import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedLocation } from "@/modules/locations";
import { LocationEditor } from "../../location-editor";
import { readError } from "../../read-error";

export default async function LocationPage({ params }: { params: Promise<{ locationId: string }> }) {
  const { locationId } = await params;
  const location = await (async () => {
    const db = getDatabase();
    return getOwnedLocation(db, await requireActor(db), locationId);
  })().catch(readError);
  return <main>
    <Link href={`/campaigns/${location.campaignId}`}>Back to campaign</Link>
    <LocationEditor key={location.id} location={{ id: location.id, name: location.name,
      description: location.description, revision: location.revision,
      archivedAt: location.archivedAt, deletedAt: location.deletedAt }} />
  </main>;
}
