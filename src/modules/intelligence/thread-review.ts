type Quest = { id: string; name: string; status: string; parentQuestId: string | null;
  archivedAt: Date | null; deletedAt: Date | null };

export type ThreadReviewItem = { id: string; name: string; parentName: string | null };
export type ThreadReview = { open: ThreadReviewItem[]; postponed: ThreadReviewItem[]; abandoned: ThreadReviewItem[] };

// A reading view over the GM's accepted Quest states. It does not infer priority or propose a status change.
export function reviewThreads(quests: readonly Quest[]): ThreadReview {
  const available = new Map(quests.filter(quest => !quest.archivedAt && !quest.deletedAt)
    .map(quest => [quest.id, quest]));
  const review: ThreadReview = { open: [], postponed: [], abandoned: [] };
  for (const quest of available.values()) {
    const group = quest.status === "OPEN" ? review.open : quest.status === "POSTPONED" ? review.postponed
      : quest.status === "ABANDONED" ? review.abandoned : null;
    if (!group) continue;
    group.push({ id: quest.id, name: quest.name,
      parentName: quest.parentQuestId ? available.get(quest.parentQuestId)?.name ?? null : null });
  }
  for (const group of Object.values(review)) group.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return review;
}
