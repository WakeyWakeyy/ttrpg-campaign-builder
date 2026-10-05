import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedLocation } from "@/modules/locations";
import { ActionForm } from "../../action-form";
import { updateLocationAction } from "../../actions";
import { LocationStatus } from "../../location-status";
import { readError } from "../../read-error";

export default async function LocationPage({ params }: { params: Promise<{ locationId: string }> }) {
  const { locationId } = await params;
  const location = await (async () => {
    const db = getDatabase();
    return getOwnedLocation(db, await requireActor(db), locationId);
  })().catch(readError);
  return <main>
    <Link href={`/campaigns/${location.campaignId}`}>Back to campaign</Link>
    <h1>{location.name}</h1>
    <p><LocationStatus location={location} /></p>
    {location.deletedAt && <p>Restore returns this location to {location.archivedAt ? "Archived" : "Active"}.</p>}
    <ActionForm key={location.revision} action={updateLocationAction.bind(null, location.id)}>
      <input type="hidden" name="expectedRevision" value={location.revision} />
      <label htmlFor="name">Name</label><input id="name" name="name" defaultValue={location.name} required readOnly={!!location.deletedAt} />
      <label htmlFor="description">Description</label><textarea id="description" name="description" defaultValue={location.description ?? ""} rows={8} readOnly={!!location.deletedAt} />
      <div className="actions">
        {!location.deletedAt && <button name="intent" value="save">Save location</button>}
        {!location.deletedAt && !location.archivedAt && <button name="intent" value="archive" formNoValidate>Archive</button>}
        {!location.deletedAt && <button name="intent" value="trash" formNoValidate>Trash</button>}
        {location.deletedAt && <button name="intent" value="restore" formNoValidate>Restore</button>}
      </div>
    </ActionForm>
  </main>;
}
