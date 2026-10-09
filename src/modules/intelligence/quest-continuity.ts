type QuestSnapshot = {
  id: string;
  name: string;
  status: string;
  parentQuestId: string | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
};

export type QuestContinuityFinding = {
  questId: string;
  questName: string;
  parentName: string;
  kind: "OPEN_CHILD_OF_CLOSED_QUEST";
};

// An advisory over accepted campaign state. The GM decides whether the open child is intentional.
export function findQuestContinuityIssues(quests: readonly QuestSnapshot[]): QuestContinuityFinding[] {
  const available = new Map(quests.filter(quest => !quest.deletedAt && !quest.archivedAt)
    .map(quest => [quest.id, quest]));
  return [...available.values()].flatMap(quest => {
    if (quest.status !== "OPEN" && quest.status !== "POSTPONED") return [];
    const parent = quest.parentQuestId ? available.get(quest.parentQuestId) : undefined;
    if (!parent || (parent.status !== "RESOLVED" && parent.status !== "FAILED" && parent.status !== "ABANDONED")) return [];
    return [{ questId: quest.id, questName: quest.name, parentName: parent.name,
      kind: "OPEN_CHILD_OF_CLOSED_QUEST" as const }];
  });
}
