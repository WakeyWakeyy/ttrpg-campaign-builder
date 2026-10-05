import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { beforeEach, expect, test, vi } from "vitest";
import { auth } from "@clerk/nextjs/server";
import { requireActor } from "../../src/infrastructure/auth/clerk/require-actor";
import { resolveIdentity, UnauthenticatedError } from "../../src/modules/identity";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("../../src/modules/identity", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/modules/identity")>(),
  resolveIdentity: vi.fn(),
}));

const db = {} as NodePgDatabase;
beforeEach(() => { vi.resetAllMocks(); });

test("rejects unauthenticated Clerk resolution with an application error before persistence", async () => {
  vi.mocked(auth).mockResolvedValue({ userId: null } as Awaited<ReturnType<typeof auth>>);
  await expect(requireActor(db)).rejects.toBeInstanceOf(UnauthenticatedError);
  await expect(requireActor(db)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  expect(resolveIdentity).not.toHaveBeenCalled();
});

test("awaits Clerk authentication and returns only the internal Actor", async () => {
  vi.mocked(auth).mockResolvedValue({ userId: "user_clerk_subject" } as Awaited<ReturnType<typeof auth>>);
  const actor = { userId: "019a1111-1111-7111-8111-111111111111" };
  vi.mocked(resolveIdentity).mockResolvedValue(actor);
  await expect(requireActor(db)).resolves.toEqual(actor);
  expect(resolveIdentity).toHaveBeenCalledWith(db, {
    provider: "clerk", providerSubject: "user_clerk_subject",
  });
});

test("does not disguise authentication infrastructure failures as unauthenticated access", async () => {
  const failure = new Error("Authentication infrastructure unavailable");
  vi.mocked(auth).mockRejectedValue(failure);
  await expect(requireActor(db)).rejects.toBe(failure);
  expect(resolveIdentity).not.toHaveBeenCalled();
});
