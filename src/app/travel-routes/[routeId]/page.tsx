import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { listOwnedLocations } from "@/modules/locations";
import { getOwnedTravelRoute } from "@/modules/travel-routes";
import { ActionForm } from "../../action-form";
import { updateTravelRouteAction } from "../../actions";
import { readError } from "../../read-error";

export default async function TravelRoutePage({ params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = await params;
  const { route, locations } = await (async () => {
    const db = getDatabase();
    const actor = await requireActor(db);
    const route = await getOwnedTravelRoute(db, actor, routeId);
    return { route, locations: await listOwnedLocations(db, actor, route.campaignId) };
  })().catch(readError);
  const available = locations.filter(place => !place.deletedAt || place.id === route.fromLocationId || place.id === route.toLocationId);
  return <main>
    <Link href={`/campaigns/${route.campaignId}#travel-routes`}>Back to campaign</Link>
    <h1>{route.name}</h1>
    <p>{route.deletedAt ? "In trash" : route.archivedAt ? "Archived" : "Active"}</p>
    {route.deletedAt && <p>Restore returns this route to {route.archivedAt ? "Archived" : "Active"}.</p>}
    <ActionForm key={route.revision} action={updateTravelRouteAction.bind(null, route.id)}>
      <input type="hidden" name="expectedRevision" value={route.revision} />
      <label htmlFor="route-name">Name</label><input id="route-name" name="name" defaultValue={route.name} required readOnly={!!route.deletedAt} />
      <label htmlFor="route-from">From</label><select id="route-from" name="fromLocationId" defaultValue={route.fromLocationId} disabled={!!route.deletedAt}>{available.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}</select>
      <label htmlFor="route-to">To</label><select id="route-to" name="toLocationId" defaultValue={route.toLocationId} disabled={!!route.deletedAt}>{available.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}</select>
      <label htmlFor="route-distance">Distance</label><input id="route-distance" name="distance" defaultValue={route.distance ?? ""} readOnly={!!route.deletedAt} />
      <label htmlFor="route-duration">Duration</label><input id="route-duration" name="duration" defaultValue={route.duration ?? ""} readOnly={!!route.deletedAt} />
      <label htmlFor="route-mode">Travel mode</label><input id="route-mode" name="mode" defaultValue={route.mode ?? ""} readOnly={!!route.deletedAt} />
      <label htmlFor="route-hazards">Hazards</label><textarea id="route-hazards" name="hazards" defaultValue={route.hazards ?? ""} rows={3} readOnly={!!route.deletedAt} />
      <label htmlFor="route-notes">GM notes</label><textarea id="route-notes" name="notes" defaultValue={route.notes ?? ""} rows={5} readOnly={!!route.deletedAt} />
      <div className="actions">
        {!route.deletedAt && <button name="intent" value="save">Save route</button>}
        {!route.deletedAt && !route.archivedAt && <button name="intent" value="archive" formNoValidate>Archive</button>}
        {!route.deletedAt && <button name="intent" value="trash" formNoValidate>Trash</button>}
        {route.deletedAt && <button name="intent" value="restore" formNoValidate>Restore</button>}
      </div>
    </ActionForm>
  </main>;
}
