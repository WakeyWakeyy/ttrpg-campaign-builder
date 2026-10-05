import "server-only";
import { createDatabase } from ".";

// A lazy process-wide pool, retained across development reloads.
const shared = globalThis as typeof globalThis & { campaignDatabase?: ReturnType<typeof createDatabase> };
export function getDatabase() {
  shared.campaignDatabase ??= createDatabase();
  return shared.campaignDatabase.db;
}
