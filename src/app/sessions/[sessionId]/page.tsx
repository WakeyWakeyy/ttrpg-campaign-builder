import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedSession } from "@/modules/sessions";
import { ActionForm } from "../../action-form";
import { updateSessionAction } from "../../actions";
import { readError } from "../../read-error";

export default async function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const item = await (async () => {
    const db = getDatabase();
    return getOwnedSession(db, await requireActor(db), sessionId);
  })().catch(readError);
  return <main>
    <Link href={`/campaigns/${item.campaignId}#sessions`}>Back to campaign</Link>
    <h1>{item.title}</h1>
    <p>{item.deletedAt ? "In trash" : item.archivedAt ? "Archived" : "Active"}</p>
    {item.deletedAt && <p>Restore returns this session to {item.archivedAt ? "Archived" : "Active"}.</p>}
    <ActionForm key={item.revision} action={updateSessionAction.bind(null, item.id)}>
      <input type="hidden" name="expectedRevision" value={item.revision} />
      <label htmlFor="session-title">Title</label>
      <input id="session-title" name="title" defaultValue={item.title} required readOnly={!!item.deletedAt} />
      <label htmlFor="session-date">Planned date (optional)</label>
      <input id="session-date" name="plannedFor" type="date" defaultValue={item.plannedFor ?? ""} readOnly={!!item.deletedAt} />
      <label htmlFor="session-preparation">Preparation</label>
      <textarea id="session-preparation" name="preparation" defaultValue={item.preparation ?? ""} rows={10} readOnly={!!item.deletedAt} />
      <label htmlFor="session-outcome">What actually happened (optional)</label>
      <textarea id="session-outcome" name="outcome" defaultValue={item.outcome ?? ""} rows={8} readOnly={!!item.deletedAt} />
      <div className="actions">
        {!item.deletedAt && <button name="intent" value="save">Save session</button>}
        {!item.deletedAt && !item.archivedAt && <button name="intent" value="archive" formNoValidate>Archive</button>}
        {!item.deletedAt && <button name="intent" value="trash" formNoValidate>Trash</button>}
        {item.deletedAt && <button name="intent" value="restore" formNoValidate>Restore</button>}
      </div>
    </ActionForm>
  </main>;
}
