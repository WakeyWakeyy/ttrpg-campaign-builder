import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedSession, listSessionScenes } from "@/modules/sessions";
import { ActionForm } from "../../action-form";
import { createSceneAction, updateSceneAction, updateSessionAction } from "../../actions";
import { readError } from "../../read-error";

export default async function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const { item, scenes } = await (async () => {
    const db = getDatabase();
    const actor = await requireActor(db);
    return { item: await getOwnedSession(db, actor, sessionId),
      scenes: await listSessionScenes(db, actor, sessionId) };
  })().catch(readError);
  return <main>
    <Link href={`/campaigns/${item.campaignId}#sessions`}>Back to campaign</Link>
    <h1>{item.title}</h1>
    <p>{item.deletedAt ? "In trash" : item.archivedAt ? "Archived" : "Active"}</p>
    {item.deletedAt && <p>Restore returns this session to {item.archivedAt ? "Archived" : "Active"}.</p>}
    <ActionForm key={item.revision} action={updateSessionAction.bind(null, item.id)} reloadLabel="Reload session">
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
    <section aria-labelledby="scenes-heading">
      <h2 id="scenes-heading">Scenes</h2>
      <p>Plan beats in order and record what happened without replacing the plan.</p>
      {scenes.length ? <ol>{scenes.map(scene => <li key={scene.id}>
        <h3>{scene.title}{scene.deletedAt ? " · In trash" : ""}</h3>
        <ActionForm key={`${scene.id}-${item.revision}`} action={updateSceneAction.bind(null, item.id, scene.id)} reloadLabel="Reload session">
          <input type="hidden" name="expectedRevision" value={item.revision} />
          <label htmlFor={`scene-position-${scene.id}`}>Order</label>
          <input id={`scene-position-${scene.id}`} name="position" type="number" min="1" required
            defaultValue={scene.position} readOnly={!!scene.deletedAt || !!item.deletedAt} />
          <label htmlFor={`scene-title-${scene.id}`}>Title</label>
          <input id={`scene-title-${scene.id}`} name="title" defaultValue={scene.title} required
            readOnly={!!scene.deletedAt || !!item.deletedAt} />
          <label htmlFor={`scene-plan-${scene.id}`}>Preparation</label>
          <textarea id={`scene-plan-${scene.id}`} name="preparation" defaultValue={scene.preparation ?? ""}
            readOnly={!!scene.deletedAt || !!item.deletedAt} />
          <label htmlFor={`scene-outcome-${scene.id}`}>What happened</label>
          <textarea id={`scene-outcome-${scene.id}`} name="outcome" defaultValue={scene.outcome ?? ""}
            readOnly={!!scene.deletedAt || !!item.deletedAt} />
          {!item.deletedAt && <div className="actions">
            {!scene.deletedAt && <button name="intent" value="save">Save scene</button>}
            {!scene.deletedAt && <button name="intent" value="trash" formNoValidate>Trash scene</button>}
            {scene.deletedAt && <button name="intent" value="restore" formNoValidate>Restore scene</button>}
          </div>}
        </ActionForm>
      </li>)}</ol> : <p>No scenes yet.</p>}
      {!item.deletedAt && <>
        <h3>Add scene</h3>
        <ActionForm key={item.revision} action={createSceneAction.bind(null, item.id)} reloadLabel="Reload session">
          <input type="hidden" name="expectedRevision" value={item.revision} />
          <label htmlFor="new-scene-title">Title</label>
          <input id="new-scene-title" name="title" required />
          <label htmlFor="new-scene-plan">Preparation</label>
          <textarea id="new-scene-plan" name="preparation" />
          <button type="submit">Add scene</button>
        </ActionForm>
      </>}
    </section>
  </main>;
}
