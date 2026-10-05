import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { authIdentity, userAccount } from "../../infrastructure/db/schema";
import type { Actor } from "./actor";

export type ProviderIdentity = Readonly<{
  provider: string;
  providerSubject: string;
}>;

class IdentityCreationLostRace extends Error {}

/** Called by trusted auth adapters, never with identity claims from request input.
 * Owns its transaction; pass the database, not an enclosing command transaction.
 */
export async function resolveIdentity(
  db: NodePgDatabase,
  identity: ProviderIdentity,
): Promise<Actor> {
  if (!identity.provider.trim() || !identity.providerSubject.trim()) {
    throw new TypeError("Provider and provider subject must be nonempty.");
  }

  const findActor = async (): Promise<Actor | undefined> => {
    const [actor] = await db.select({ userId: authIdentity.userId })
      .from(authIdentity)
      .where(and(
        eq(authIdentity.provider, identity.provider),
        eq(authIdentity.providerSubject, identity.providerSubject),
      ));
    return actor;
  };

  const existing = await findActor();
  if (existing) return existing;

  try {
    return await db.transaction(async (tx) => {
      const [account] = await tx.insert(userAccount).values({}).returning({ id: userAccount.id });
      const [mapping] = await tx.insert(authIdentity)
        .values({ ...identity, userId: account.id })
        .onConflictDoNothing({ target: [authIdentity.provider, authIdentity.providerSubject] })
        .returning({ userId: authIdentity.userId });

      // The unique index waits for the competing transaction. Roll back our
      // account too, rather than committing an orphan when its mapping loses.
      if (!mapping) throw new IdentityCreationLostRace();
      return mapping;
    });
  } catch (error) {
    if (!(error instanceof IdentityCreationLostRace)) throw error;
    // Read after rollback, with a fresh snapshot that sees the committed winner.
    const winner = await findActor();
    if (!winner) throw new Error("Resolved identity disappeared after concurrent creation.");
    return winner;
  }
}
