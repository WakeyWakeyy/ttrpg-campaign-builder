type Event = { id: string; title: string; occurredAt: Date | null; inWorldDate: string | null;
  archivedAt: Date | null; deletedAt: Date | null };
type Link = { eventId: string; targetEntityId: string | null; targetNameSnapshot: string };

export type TimelineContinuityFinding = { firstId: string; firstTitle: string; secondId: string;
  secondTitle: string; entityName: string; inWorldDate: string };

// A review prompt only: the two dates may intentionally describe different calendars.
export function findTimelineContinuityIssues(events: readonly Event[], links: readonly Link[]): TimelineContinuityFinding[] {
  const available = new Map(events.filter(event => !event.archivedAt && !event.deletedAt && event.occurredAt
    && event.inWorldDate?.trim()).map(event => [event.id, event]));
  const groups = new Map<string, { event: Event; entityName: string }[]>();
  for (const link of links) {
    const event = available.get(link.eventId);
    if (!event || !link.targetEntityId) continue;
    const key = `${link.targetEntityId}\0${event.inWorldDate!.trim().toLocaleLowerCase()}`;
    const group = groups.get(key) ?? [];
    group.push({ event, entityName: link.targetNameSnapshot });
    groups.set(key, group);
  }
  const findings: TimelineContinuityFinding[] = [];
  for (const group of groups.values()) {
    for (let first = 0; first < group.length; first++) for (let second = first + 1; second < group.length; second++) {
      const a = group[first].event;
      const b = group[second].event;
      if (a.occurredAt!.getTime() === b.occurredAt!.getTime()) continue;
      findings.push({ firstId: a.id, firstTitle: a.title, secondId: b.id, secondTitle: b.title,
        entityName: group[first].entityName, inWorldDate: a.inWorldDate!.trim() });
    }
  }
  return findings;
}
