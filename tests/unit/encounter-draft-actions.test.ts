import { beforeEach, expect, test, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { editEncounter, editEncounterCreature, getOwnedEncounter, listEncounterCreatures, EncounterRevisionConflictError } from "@/modules/encounters";
import { readEncounterDraftAction } from "../../src/app/encounter-draft-actions";
import { updateEncounterAction, updateEncounterCreatureAction } from "../../src/app/actions";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/infrastructure/db/server", () => ({ getDatabase: () => ({}) }));
vi.mock("@/infrastructure/auth/clerk/require-actor", () => ({ requireActor: async () => ({ userId: "owner" }) }));
vi.mock("@/modules/encounters", async importOriginal => ({ ...await importOriginal<typeof import("@/modules/encounters")>(),
  getOwnedEncounter: vi.fn(), listEncounterCreatures: vi.fn(), editEncounter: vi.fn(), editEncounterCreature: vi.fn() }));
const parent = { id: "encounter", campaignId: "campaign", title: "Crossing", notes: "Plan", partyLevel: 2, partySize: 4, revision: 3, deletedAt: null };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getOwnedEncounter).mockResolvedValue(parent as Awaited<ReturnType<typeof getOwnedEncounter>>);
  vi.mocked(listEncounterCreatures).mockResolvedValue([{ id: "creature", name: "Guard", xp: 100, quantity: 2, deletedAt: null }] as Awaited<ReturnType<typeof listEncounterCreatures>>);
});
test("recovery authorizes the parent and resolves only its own child", async () => {
  expect(await readEncounterDraftAction("encounter", { kind: "creature", creatureId: "creature" })).toMatchObject({ ok: true,
    snapshot: { revision: 3, values: { name: "Guard", xp: "100", quantity: "2" } } });
  expect(getOwnedEncounter).toHaveBeenCalledWith({}, { userId: "owner" }, "encounter");
  expect(listEncounterCreatures).toHaveBeenCalledWith({}, { userId: "owner" }, "encounter");
  expect(await readEncounterDraftAction("encounter", { kind: "creature", creatureId: "foreign" })).toMatchObject({ ok: false });
  expect(editEncounter).not.toHaveBeenCalled(); expect(revalidatePath).not.toHaveBeenCalled();
});
test("save forwards the original revision and confirms only after the transaction", async () => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ expectedRevision: "2", intent: "save", title: "Local", notes: "Pending", partyLevel: "3", partySize: "5" })) data.set(key, value);
  let resolve!: (value: Awaited<ReturnType<typeof editEncounter>>) => void;
  vi.mocked(editEncounter).mockImplementation(() => new Promise(done => { resolve = done; }));
  const result = updateEncounterAction("encounter", { message: "" }, data);
  await vi.waitFor(() => expect(editEncounter).toHaveBeenCalledOnce());
  expect(revalidatePath).not.toHaveBeenCalled();
  expect(editEncounter).toHaveBeenCalledWith({}, { userId: "owner" }, "encounter", { expectedRevision: 2, title: "Local", notes: "Pending", partyLevel: 3, partySize: 5 });
  resolve(parent as Awaited<ReturnType<typeof editEncounter>>);
  expect(await result).toMatchObject({ success: { revision: 3 } }); expect(redirect).not.toHaveBeenCalled();
});
test("child conflict returns no success and does not invalidate", async () => {
  vi.mocked(editEncounterCreature).mockRejectedValue(new EncounterRevisionConflictError());
  const data = new FormData(); data.set("intent", "save"); data.set("expectedRevision", "2");
  expect(await updateEncounterCreatureAction("encounter", "creature", { message: "" }, data)).toMatchObject({ conflict: true });
  expect(revalidatePath).not.toHaveBeenCalled(); expect(redirect).not.toHaveBeenCalled();
});
