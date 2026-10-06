import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedArc } from "@/modules/arcs";
import { ActionForm } from "../../action-form";
import { ArcStatus } from "../../arc-status";
import { updateArcAction } from "../../actions";
import { readError } from "../../read-error";

export default async function ArcPage({ params }: { params: Promise<{ arcId: string }> }) {
  const { arcId } = await params;
  const arc = await (async () => {
    const db = getDatabase();
    return getOwnedArc(db, await requireActor(db), arcId);
  })().catch(readError);
  return <main>
    <Link href={`/campaigns/${arc.campaignId}#arcs`}>Back to campaign arcs</Link>
    <h1>{arc.name}</h1>
    <p><ArcStatus arc={arc} /></p>
    {arc.deletedAt && <p>Restore returns this arc to {arc.archivedAt ? "Archived" : "Active"}.</p>}
    <ActionForm key={arc.revision} action={updateArcAction.bind(null, arc.id)} reloadLabel="Reload arc">
      <input type="hidden" name="expectedRevision" value={arc.revision} />
      <label htmlFor="arc-name">Name</label><input id="arc-name" name="name" defaultValue={arc.name} required readOnly={!!arc.deletedAt} />
      <label htmlFor="arc-description">Description</label><textarea id="arc-description" name="description" defaultValue={arc.description ?? ""} rows={8} readOnly={!!arc.deletedAt} />
      <div className="actions">
        {!arc.deletedAt && <button name="intent" value="save">Save arc</button>}
        {!arc.deletedAt && !arc.archivedAt && <button name="intent" value="archive" formNoValidate>Archive</button>}
        {!arc.deletedAt && <button name="intent" value="trash" formNoValidate>Trash</button>}
        {arc.deletedAt && <button name="intent" value="restore" formNoValidate>Restore</button>}
      </div>
    </ActionForm>
  </main>;
}
