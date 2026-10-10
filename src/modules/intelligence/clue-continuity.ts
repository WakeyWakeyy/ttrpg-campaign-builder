type Clue = { id: string; title: string; discoveryLocationId: string | null;
  archivedAt: Date | null; deletedAt: Date | null };
type Location = { id: string; name: string; archivedAt: Date | null; deletedAt: Date | null };

export type ClueContinuityFinding = { clueId: string; clueTitle: string; reason: "NO_ROUTE" | "LOCATION_UNAVAILABLE";
  locationName?: string };

// Only the recorded route is reviewed. Another route may exist in the GM's notes or at the table.
export function findClueContinuityIssues(clues: readonly Clue[], locations: readonly Location[]): ClueContinuityFinding[] {
  const byId = new Map(locations.map(location => [location.id, location]));
  return clues.flatMap((clue): ClueContinuityFinding[] => {
    if (clue.archivedAt || clue.deletedAt) return [];
    if (!clue.discoveryLocationId) return [{ clueId: clue.id, clueTitle: clue.title, reason: "NO_ROUTE" as const }];
    const location = byId.get(clue.discoveryLocationId);
    if (!location || location.archivedAt || location.deletedAt) return [{ clueId: clue.id,
      clueTitle: clue.title, reason: "LOCATION_UNAVAILABLE" as const, locationName: location?.name }];
    return [];
  });
}
