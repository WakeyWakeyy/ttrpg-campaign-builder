import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedTimelineEvent, listTimelineEventLinks } from "@/modules/timeline";
import { listOwnedRelationships } from "@/modules/relationships";
import { ActionForm } from "../../action-form";
import { updateTimelineEventAction } from "../../actions";
import { readError } from "../../read-error";
import { relationshipOptions } from "../../relationship-options";

export default async function TimelineEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { event, links, choices } = await (async () => {
    const db = getDatabase();
    const actor = await requireActor(db);
    const event = await getOwnedTimelineEvent(db, actor, eventId);
    const [links, choices, relationships] = await Promise.all([
      listTimelineEventLinks(db, actor, eventId),
      relationshipOptions(db, actor, event.campaignId),
      listOwnedRelationships(db, actor, event.campaignId),
    ]);
    return { event, links, choices: [...choices, ...relationships.map(row => ({
      id: row.id, name: row.kind, type: "Relationship", deletedAt: row.deletedAt,
    }))] };
  })().catch(readError);
  const linkedIds = new Set(links.map(link => link.targetEntityId));
  const available = choices.filter(choice => !choice.deletedAt || linkedIds.has(choice.id));
  return <main>
    <Link href={`/campaigns/${event.campaignId}#timeline`}>Back to campaign</Link>
    <h1>{event.title}</h1>
    <p>{event.deletedAt ? "In trash" : event.archivedAt ? "Archived" : "Active"}</p>
    {event.deletedAt && <p>Restore returns this event to {event.archivedAt ? "Archived" : "Active"}.</p>}
    {links.length > 0 && <section aria-label="Related entities"><h2>Related entities</h2><ul>
      {links.map(link => <li key={link.id}>{link.targetTypeSnapshot}: {link.targetNameSnapshot}
        {link.targetEntityId ? "" : " (historical link)"}</li>)}
    </ul></section>}
    <ActionForm key={event.revision} action={updateTimelineEventAction.bind(null, event.id)}>
      <input type="hidden" name="expectedRevision" value={event.revision} />
      <label htmlFor="timeline-title">Title</label>
      <input id="timeline-title" name="title" defaultValue={event.title} required readOnly={!!event.deletedAt} />
      <label htmlFor="timeline-description">What happened</label>
      <textarea id="timeline-description" name="description" defaultValue={event.description ?? ""} rows={5} readOnly={!!event.deletedAt} />
      <label htmlFor="timeline-occurred">Real date (optional)</label>
      <input id="timeline-occurred" name="occurredOn" type="date" defaultValue={event.occurredAt?.toISOString().slice(0, 10) ?? ""} readOnly={!!event.deletedAt} />
      <label htmlFor="timeline-world-date">In-world date (optional)</label>
      <input id="timeline-world-date" name="inWorldDate" defaultValue={event.inWorldDate ?? ""} readOnly={!!event.deletedAt} />
      <fieldset disabled={!!event.deletedAt}><legend>Related entities</legend>
        {available.map(choice => <label key={choice.id}><input type="checkbox" name="entityIds" value={choice.id}
          defaultChecked={linkedIds.has(choice.id)} /> {choice.type}: {choice.name}</label>)}
      </fieldset>
      <div className="actions">
        {!event.deletedAt && <button name="intent" value="save">Save event</button>}
        {!event.deletedAt && !event.archivedAt && <button name="intent" value="archive" formNoValidate>Archive</button>}
        {!event.deletedAt && <button name="intent" value="trash" formNoValidate>Trash</button>}
        {event.deletedAt && <button name="intent" value="restore" formNoValidate>Restore</button>}
      </div>
    </ActionForm>
  </main>;
}
