import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { listOwnedPlayerCharacters } from "@/modules/player-characters";
import { getOwnedSession, getPreviousSessionContext, listSessionAttendance, listSessionScenes } from "@/modules/sessions";
import { listSessionEncounterPlacements } from "@/modules/encounters";
import { readError } from "../../../read-error";

export default async function SessionRunPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const { session, scenes, previous, characters, attendance, placements } = await (async () => {
    const db = getDatabase();
    const actor = await requireActor(db);
    const session = await getOwnedSession(db, actor, sessionId);
    return {
      session,
      scenes: await listSessionScenes(db, actor, sessionId),
      previous: await getPreviousSessionContext(db, actor, sessionId),
      characters: await listOwnedPlayerCharacters(db, actor, session.campaignId),
      attendance: await listSessionAttendance(db, actor, sessionId),
      placements: await listSessionEncounterPlacements(db, actor, sessionId),
    };
  })().catch(readError);
  const activeScenes = scenes.filter(scene => !scene.deletedAt);
  const attendees = characters.filter(character => attendance.some(row => row.playerCharacterId === character.id));

  return <main className="run-view">
    <nav aria-label="Session navigation"><Link href={`/sessions/${session.id}`}>Edit session</Link>
      {" · "}<Link href={`/sessions/${session.id}/recap`}>Record outcomes</Link>
      {" · "}<Link href={`/campaigns/${session.campaignId}#sessions`}>Campaign workspace</Link></nav>
    <header className="run-heading"><div><p className="workspace-eyebrow">Run View</p><h1>{session.title}</h1>
      {session.plannedFor && <p>Planned for {session.plannedFor}</p>}</div>
      {(session.deletedAt || session.archivedAt) && <span className="status">{session.deletedAt ? "In trash" : "Archived"}</span>}</header>
    {session.deletedAt && <p>This session is in trash. Restore it from the edit page to continue using it.</p>}
    <nav className="run-nav" aria-label="Run View sections">
      <a href="#recap">Previous session</a><a href="#attendance">Attendance</a>
      <a href="#preparation">Preparation</a><a href="#scenes">Scenes</a>
    </nav>
    <section id="recap" className="run-section" aria-labelledby="recap-heading">
      <h2 id="recap-heading">Previously</h2>
      {previous ? <><p><Link href={`/sessions/${previous.session.id}`}>{previous.session.title}</Link></p>
        {previous.session.outcome?.trim() ? <p className="preserve-lines">{previous.session.outcome}</p>
          : <p>No session outcome recorded yet.</p>}
        {previous.scenes.length > 0 && <><h3>Scene outcomes</h3><ul>{previous.scenes.map((scene, index) =>
          <li key={index}><strong>{scene.title}:</strong> <span className="preserve-lines">{scene.outcome}</span></li>)}</ul></>}
      </> : <p>No earlier available session.</p>}
    </section>
    <section id="attendance" className="run-section" aria-labelledby="run-attendance-heading">
      <h2 id="run-attendance-heading">Attendance</h2>
      {!session.attendanceSet ? <p>Attendance has not been recorded for this session.</p>
        : attendees.length ? <ul>{attendees.map(character => <li key={character.id}>{character.name}
          {character.deletedAt ? " (in trash)" : ""}</li>)}</ul>
          : <p>No player characters attended.</p>}
    </section>
    <section id="preparation" className="run-section" aria-labelledby="run-preparation-heading">
      <h2 id="run-preparation-heading">Session preparation</h2>
      {session.preparation?.trim() ? <p className="preserve-lines">{session.preparation}</p> : <p>No preparation recorded yet.</p>}
      {placements.filter(placement => !placement.sceneId).length > 0 && <><h3>Encounters</h3><ul>
        {placements.filter(placement => !placement.sceneId).map(placement => <li key={placement.id}>
          <Link href={`/encounters/${placement.encounterId}`}>{placement.title}</Link>
          {placement.encounterDeletedAt ? " (definition in trash)" : ""}</li>)}
      </ul></>}
    </section>
    <section id="scenes" className="run-section" aria-labelledby="run-scenes-heading">
      <h2 id="run-scenes-heading">Scenes</h2>
      {activeScenes.length ? <ol className="run-scenes">{activeScenes.map(scene => <li key={scene.id}>
        <h3>{scene.title}</h3>
        {scene.preparation?.trim() ? <p className="preserve-lines">{scene.preparation}</p> : <p>No preparation recorded.</p>}
        {placements.filter(placement => placement.sceneId === scene.id).length > 0 && <ul>
          {placements.filter(placement => placement.sceneId === scene.id).map(placement => <li key={placement.id}>
            <Link href={`/encounters/${placement.encounterId}`}>{placement.title}</Link>
            {placement.encounterDeletedAt ? " (definition in trash)" : ""}</li>)}
        </ul>}
        {scene.outcome?.trim() && <details><summary>Recorded outcome</summary>
          <p className="preserve-lines">{scene.outcome}</p></details>}
      </li>)}</ol> : <p>No available scenes yet.</p>}
    </section>
  </main>;
}
