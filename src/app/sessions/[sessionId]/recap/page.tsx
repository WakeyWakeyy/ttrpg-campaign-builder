import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedSession, listSessionScenes } from "@/modules/sessions";
import { ActionForm } from "../../../action-form";
import { recordSceneOutcomeAction, recordSessionOutcomeAction } from "../../../actions";
import { readError } from "../../../read-error";

export default async function SessionRecapPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const { session, scenes } = await (async () => {
    const db = getDatabase();
    const actor = await requireActor(db);
    return { session: await getOwnedSession(db, actor, sessionId),
      scenes: await listSessionScenes(db, actor, sessionId) };
  })().catch(readError);
  const availableScenes = scenes.filter(scene => !scene.deletedAt);

  return <main>
    <nav aria-label="Session navigation"><Link href={`/sessions/${session.id}`}>Edit session</Link>
      {" · "}<Link href={`/sessions/${session.id}/run`}>Run View</Link></nav>
    <h1>What happened in {session.title}?</h1>
    <p>Record the table outcome here. Your preparation stays available for comparison and future sessions.</p>
    {session.deletedAt && <p>This session is in trash. Restore it from the edit page to record outcomes.</p>}
    <section aria-labelledby="session-recap-heading">
      <h2 id="session-recap-heading">Session outcome</h2>
      {session.preparation?.trim() && <details><summary>Show session preparation</summary>
        <p className="preserve-lines">{session.preparation}</p></details>}
      <ActionForm key={`outcome-${session.revision}`} action={recordSessionOutcomeAction.bind(null, session.id)} reloadLabel="Reload outcomes">
        <input type="hidden" name="expectedRevision" value={session.revision} />
        <label htmlFor="session-recap">What actually happened?</label>
        <textarea id="session-recap" name="outcome" rows={8} defaultValue={session.outcome ?? ""}
          readOnly={!!session.deletedAt} />
        {!session.deletedAt && <button type="submit">Save session outcome</button>}
      </ActionForm>
    </section>
    <section aria-labelledby="scene-recaps-heading">
      <h2 id="scene-recaps-heading">Scene outcomes</h2>
      {availableScenes.length ? <ol>{availableScenes.map(scene => <li key={scene.id}>
        <h3>{scene.title}</h3>
        {scene.preparation?.trim() && <details><summary>Show preparation</summary>
          <p className="preserve-lines">{scene.preparation}</p></details>}
        <ActionForm key={`${scene.id}-${session.revision}`} action={recordSceneOutcomeAction.bind(null, session.id, scene.id)} reloadLabel="Reload outcomes">
          <input type="hidden" name="expectedRevision" value={session.revision} />
          <label htmlFor={`scene-recap-${scene.id}`}>What happened in this scene?</label>
          <textarea id={`scene-recap-${scene.id}`} name="outcome" rows={5} defaultValue={scene.outcome ?? ""}
            readOnly={!!session.deletedAt} />
          {!session.deletedAt && <button type="submit">Save scene outcome</button>}
        </ActionForm>
      </li>)}</ol> : <p>No available scenes yet.</p>}
    </section>
  </main>;
}
