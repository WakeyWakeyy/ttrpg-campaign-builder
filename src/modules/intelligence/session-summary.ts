type SessionOutcome = { id: string; title: string; plannedFor: string | null; outcome: string | null;
  archivedAt: Date | null; deletedAt: Date | null };
type SceneOutcome = { sessionId: string; id: string; title: string; outcome: string | null;
  deletedAt: Date | null };

export type SessionSummary = { sessionId: string; title: string; plannedFor: string | null;
  outcome: string | null; scenes: { id: string; title: string; outcome: string }[] };

// Preserve the GM's words and source IDs. This is a reading view, not generated campaign truth.
export function summarizeSessionOutcomes(sessions: readonly SessionOutcome[], scenes: readonly SceneOutcome[]): SessionSummary[] {
  const available = sessions.filter(session => !session.deletedAt && !session.archivedAt);
  return available.map(session => ({
    sessionId: session.id,
    title: session.title,
    plannedFor: session.plannedFor,
    outcome: session.outcome?.trim() || null,
    scenes: scenes.filter(scene => scene.sessionId === session.id && !scene.deletedAt && scene.outcome?.trim())
      .map(scene => ({ id: scene.id, title: scene.title, outcome: scene.outcome!.trim() })),
  })).filter(summary => summary.outcome || summary.scenes.length);
}
