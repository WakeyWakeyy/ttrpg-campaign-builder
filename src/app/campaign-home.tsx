import { GuardedLink } from "./unsaved-navigation";
import { compassExcerpt, recentActiveSessions } from "./campaign-home-data";
import styles from "./campaign-home.module.css";

type HomeSession = { id: string; title: string; updatedAt: Date; archivedAt: Date | null; deletedAt: Date | null };

export function CampaignHome({ campaignId, premise, sessions }: {
  campaignId: string;
  premise: string;
  sessions: readonly HomeSession[];
}) {
  const recent = recentActiveSessions(sessions);
  return <section className={styles.home} aria-label="Campaign Home" lang="es">
    <div>
      <h2>Dirección actual</h2>
      <p>{compassExcerpt(premise) || "Todavía no hay una dirección actual registrada."}</p>
      <a href="#compass">Ver Campaign Compass</a>
    </div>
    <section aria-labelledby="recent-sessions-heading">
      <h2 id="recent-sessions-heading">Sesiones actualizadas recientemente</h2>
      <p>Sesiones activas, ordenadas por última modificación. Esa fecha no indica cuándo se jugaron ni su estado de preparación.</p>
      {recent.length ? <ul className={styles.sessions}>{recent.map(item => <li key={item.id}>
        <h3>{item.title}</h3>
        <p>Actualizada: <time dateTime={item.updatedAt.toISOString()}>{item.updatedAt.toISOString().slice(0, 10)} UTC</time></p>
        <nav className={styles.links} aria-label={`Continuar ${item.title}`}>
          <GuardedLink prefetch={false} href={`/sessions/${item.id}`}>Preparar</GuardedLink>
          <GuardedLink prefetch={false} href={`/sessions/${item.id}/run`}>Run</GuardedLink>
          <GuardedLink prefetch={false} href={`/sessions/${item.id}/recap`}>Recap</GuardedLink>
        </nav>
      </li>)}</ul> : <p>No hay sesiones activas. Podés comenzar a preparar una sin crear personajes, lugares ni otras entidades primero.</p>}
      <div className={styles.links}>
        <a href="#prepare-session">Preparar una nueva sesión</a>
        <a href="#sessions">Ver todas las sesiones</a>
      </div>
    </section>
    <nav aria-label="Material de campaña" className={styles.groups}>
      <div><h2>Historia</h2><ul>
        <li><a href="#arcs">Arcos</a> · <a href="#quests">Quests</a></li>
        <li><GuardedLink prefetch={false} href={`/campaigns/${campaignId}/threads`}>Threads para revisar</GuardedLink></li>
        <li><a href="#timeline">Timeline</a></li>
        <li><GuardedLink prefetch={false} href={`/campaigns/${campaignId}/summary`}>Lo que ocurrió</GuardedLink></li>
      </ul></div>
      <div><h2>Mundo y personajes</h2><ul>
        <li><a href="#locations">Lugares</a> · <a href="#travel-routes">Rutas</a></li>
        <li><a href="#npcs">NPCs</a> · <a href="#player-characters">Personajes jugadores</a></li>
        <li><a href="#parties">Parties</a> · <a href="#factions">Facciones</a></li>
        <li><a href="#items">Objetos</a> · <a href="#relationships">Relaciones</a></li>
        <li><a href="#clues">Pistas</a> · <a href="#secrets">Secretos</a></li>
      </ul></div>
      <div><h2>Material de mesa</h2><ul>
        <li><a href="#encounters">Encounters</a> · <a href="#rewards">Rewards</a></li>
        <li><a href="#grant-ledger">Grants registrados</a></li>
        <li><a href="#rules-reference">Reglas de referencia</a></li>
        <li><a href="#export">Exportaciones</a></li>
      </ul></div>
    </nav>
  </section>;
}
