import { beforeEach, expect, test, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { unarchiveLocation, editLocation, LocationRevisionConflictError } from "@/modules/locations";
import { unarchiveSession, editSession, SessionRevisionConflictError } from "@/modules/sessions";
import { unarchiveEncounter, editEncounter, EncounterRevisionConflictError } from "@/modules/encounters";
import { unarchiveReward, editReward, RewardRevisionConflictError } from "@/modules/rewards";
import { updateLocationAction } from "../../src/app/location-actions";
import { updateSessionAction, updateEncounterAction, updateRewardAction } from "../../src/app/actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/infrastructure/db/server", () => ({ getDatabase: () => ({}) }));
vi.mock("@/infrastructure/auth/clerk/require-actor", () => ({ requireActor: async () => ({ userId: "owner" }) }));
vi.mock("@/modules/locations", async original => ({ ...await original<typeof import("@/modules/locations")>(), unarchiveLocation: vi.fn(), editLocation: vi.fn() }));
vi.mock("@/modules/sessions", async original => ({ ...await original<typeof import("@/modules/sessions")>(), unarchiveSession: vi.fn(), editSession: vi.fn() }));
vi.mock("@/modules/encounters", async original => ({ ...await original<typeof import("@/modules/encounters")>(), unarchiveEncounter: vi.fn(), editEncounter: vi.fn() }));
vi.mock("@/modules/rewards", async original => ({ ...await original<typeof import("@/modules/rewards")>(), unarchiveReward: vi.fn(), editReward: vi.fn() }));

const parent = { id: "entity", campaignId: "campaign", name: "Persisted", description: "Original", revision: 8, archivedAt: null, deletedAt: null };
const cases = [
  { name: "Location", command: unarchiveLocation, conflict: LocationRevisionConflictError, run: (data: FormData) => updateLocationAction("entity", data) },
  { name: "Session", command: unarchiveSession, conflict: SessionRevisionConflictError, run: (data: FormData) => updateSessionAction("entity", { message: "" }, data) },
  { name: "Encounter", command: unarchiveEncounter, conflict: EncounterRevisionConflictError, run: (data: FormData) => updateEncounterAction("entity", { message: "" }, data) },
  { name: "Reward", command: unarchiveReward, conflict: RewardRevisionConflictError, run: (data: FormData) => updateRewardAction("entity", { message: "" }, data) },
];
function form(intent = "unarchive") {
  const data = new FormData();
  for (const [key, value] of Object.entries({ intent, expectedRevision: "7", name: "   ", title: "   ", description: "Unsaved", preparation: "Local plan", notes: "Local notes", partyLevel: "invalid" })) data.set(key, value);
  return data;
}
beforeEach(() => vi.resetAllMocks());
for (const item of cases) {
  test(`${item.name} unarchive forwards only identity/revision and confirms after acceptance`, async () => {
    let commit!: () => void;
    const gate = new Promise<void>(resolve => { commit = resolve; });
    vi.mocked(item.command).mockImplementation(async () => { await gate; return parent as never; });
    const result = item.run(form());
    await vi.waitFor(() => expect(item.command).toHaveBeenCalledExactlyOnceWith({}, { userId: "owner" }, "entity", 7));
    expect(revalidatePath).not.toHaveBeenCalled();
    commit();
    const accepted = await result;
    if (item.name === "Location") expect(accepted).toMatchObject({ ok: true, location: { revision: 8, archivedAt: null } });
    else expect(accepted).toMatchObject({ message: expect.stringContaining("Draft text was not saved"), success: { revision: 8, preserveDraft: true } });
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/campaign");
    for (const command of [editLocation, editSession, editEncounter, editReward]) expect(command).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
  test(`${item.name} stale unarchive returns conflict without success or invalidation`, async () => {
    vi.mocked(item.command).mockRejectedValue(new item.conflict());
    const result = await item.run(form());
    expect(result).toMatchObject({ conflict: true });
    expect(result).not.toHaveProperty("success"); expect(result).not.toHaveProperty("location");
    expect(revalidatePath).not.toHaveBeenCalled(); expect(redirect).not.toHaveBeenCalled();
  });
  test(`${item.name} rejects unrelated intents without calling Unarchive`, async () => {
    const result = await item.run(form("not-a-lifecycle-intent"));
    expect(result).not.toHaveProperty("success"); expect(result).not.toHaveProperty("location");
    expect(item.command).not.toHaveBeenCalled(); expect(revalidatePath).not.toHaveBeenCalled();
  });
}
