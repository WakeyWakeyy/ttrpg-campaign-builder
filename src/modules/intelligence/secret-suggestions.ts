type Secret = { id: string; title: string; archivedAt: Date | null; deletedAt: Date | null };
type Clue = { secretId: string | null; archivedAt: Date | null; deletedAt: Date | null };

export type SecretSuggestion = { secretId: string; secretTitle: string };

// A missing recorded clue is a preparation option, not evidence that discovery is impossible.
export function suggestSecretDiscoveryPaths(secrets: readonly Secret[], clues: readonly Clue[]): SecretSuggestion[] {
  const linked = new Set(clues.filter(clue => !clue.archivedAt && !clue.deletedAt && clue.secretId)
    .map(clue => clue.secretId));
  return secrets.filter(secret => !secret.archivedAt && !secret.deletedAt && !linked.has(secret.id))
    .map(secret => ({ secretId: secret.id, secretTitle: secret.title }));
}
