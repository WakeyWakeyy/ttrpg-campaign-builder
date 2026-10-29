import { beforeEach, expect, test, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getOwnedReward, listRewardComponents } from "@/modules/rewards";
import { recordRewardGrant, RewardGrantIdempotencyConflictError } from "@/modules/rewards/grants";
import { readRewardDraftAction } from "../../src/app/reward-draft-actions";
import { recordRewardGrantAction } from "../../src/app/actions";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/infrastructure/db/server", () => ({ getDatabase: () => ({}) }));
vi.mock("@/infrastructure/auth/clerk/require-actor", () => ({ requireActor: async () => ({ userId: "owner" }) }));
vi.mock("@/modules/rewards", async importOriginal => ({ ...await importOriginal<typeof import("@/modules/rewards")>(),
  getOwnedReward: vi.fn(), listRewardComponents: vi.fn() }));
vi.mock("@/modules/rewards/grants", async importOriginal => ({ ...await importOriginal<typeof import("@/modules/rewards/grants")>(), recordRewardGrant: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getOwnedReward).mockResolvedValue({ id: "reward", campaignId: "campaign", revision: 4, deletedAt: null } as Awaited<ReturnType<typeof getOwnedReward>>);
  vi.mocked(listRewardComponents).mockResolvedValue([{ id: "component", kind: "FAVOR", description: "Accepted favor", deletedAt: null }] as Awaited<ReturnType<typeof listRewardComponents>>);
});
test("consultation is owner/parent scoped; grant preview uses persisted components without a write", async () => {
  expect(await readRewardDraftAction("reward", { kind: "component", componentId: "foreign" })).toMatchObject({ ok: false });
  expect(await readRewardDraftAction("reward", { kind: "grant" })).toMatchObject({ ok: true,
    snapshot: { revision: 4, values: { componentIds: [], recipient: "", sessionId: "", notes: "" }, context: expect.stringContaining("Accepted favor") } });
  expect(getOwnedReward).toHaveBeenCalledWith({}, { userId: "owner" }, "reward");
  expect(listRewardComponents).toHaveBeenCalledWith({}, { userId: "owner" }, "reward");
  expect(recordRewardGrant).not.toHaveBeenCalled(); expect(revalidatePath).not.toHaveBeenCalled();
});
function grantData() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ expectedRevision: "2", requestKey: "original-key", recipient: "Party", notes: "Local outcome", sessionId: "session" })) data.set(key, value);
  data.append("componentIds", "a"); data.append("componentIds", "b"); return data;
}
test("grant forwards its original key, full selection and revision and waits for confirmation", async () => {
  let resolve!: (value: Awaited<ReturnType<typeof recordRewardGrant>>) => void;
  vi.mocked(recordRewardGrant).mockImplementation(() => new Promise(done => { resolve = done; }));
  const result = recordRewardGrantAction("reward", { message: "" }, grantData());
  await vi.waitFor(() => expect(recordRewardGrant).toHaveBeenCalledOnce());
  expect(recordRewardGrant).toHaveBeenCalledWith({}, { userId: "owner" }, "reward", {
    expectedRevision: 2, requestKey: "original-key", componentIds: ["a", "b"], recipient: "Party", notes: "Local outcome", sessionId: "session",
  });
  expect(revalidatePath).not.toHaveBeenCalled();
  resolve({ id: "grant" } as Awaited<ReturnType<typeof recordRewardGrant>>);
  expect(await result).toMatchObject({ success: { revision: 4 } }); expect(redirect).not.toHaveBeenCalled();
});
test("key reuse with another payload cannot be recovered as an ordinary revision conflict", async () => {
  vi.mocked(recordRewardGrant).mockRejectedValue(new RewardGrantIdempotencyConflictError());
  const result = await recordRewardGrantAction("reward", { message: "" }, grantData());
  expect(result).toMatchObject({ requestConflict: true }); expect(result).not.toHaveProperty("success");
  expect(revalidatePath).not.toHaveBeenCalled(); expect(redirect).not.toHaveBeenCalled();
});
