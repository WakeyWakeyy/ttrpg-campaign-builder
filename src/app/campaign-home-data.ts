type SessionActivity = { id: string; updatedAt: Date; archivedAt: Date | null; deletedAt: Date | null };

// Presentation over the workspace's already authorized records. This does not
// identify the next session, a play date, readiness or the GM's current editor.
export function recentActiveSessions<T extends SessionActivity>(sessions: readonly T[]): T[] {
  return sessions.filter(item => !item.archivedAt && !item.deletedAt)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
      || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, 3);
}

export function compassExcerpt(premise: string): string {
  const characters = Array.from(premise.replace(/\s+/g, " ").trim());
  return characters.length > 240 ? `${characters.slice(0, 240).join("").trimEnd()}…` : characters.join("");
}
