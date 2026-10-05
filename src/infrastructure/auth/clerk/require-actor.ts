import { auth } from "@clerk/nextjs/server";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { type Actor, resolveIdentity, UnauthenticatedError } from "../../../modules/identity";

/** Resolve request authentication before calling feature application code. */
export async function requireActor(db: NodePgDatabase): Promise<Actor> {
  const { userId } = await auth();
  if (!userId) throw new UnauthenticatedError();

  return resolveIdentity(db, { provider: "clerk", providerSubject: userId });
}
