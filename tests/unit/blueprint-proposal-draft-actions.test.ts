import { beforeEach, expect, test, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BlueprintNotFoundError, BlueprintRevisionConflictError, decideBlueprintProposal, getBlueprintReview, getOwnedBlueprint } from "@/modules/blueprints";
import { readBlueprintProposalDraftAction } from "../../src/app/blueprint-proposal-draft-actions";
import { decideBlueprintProposalAction } from "../../src/app/actions";
import { initialPlanningDraft, planningDraftReducer } from "../../src/app/planning-draft-state";
import { blueprintProposalSnapshot } from "../../src/app/blueprint-proposal-draft";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/infrastructure/db/server", () => ({ getDatabase: () => ({}) }));
vi.mock("@/infrastructure/auth/clerk/require-actor", () => ({ requireActor: async () => ({ userId: "owner" }) }));
vi.mock("@/modules/blueprints", async importOriginal => ({ ...await importOriginal<typeof import("@/modules/blueprints")>(),
  getBlueprintReview: vi.fn(), getOwnedBlueprint: vi.fn(), decideBlueprintProposal: vi.fn() }));
const review = { draft: { id: "blueprint", ownerUserId: "owner", title: "City", premise: "Resurfacing",
  setting: null, tone: null, proposedLocations: ["Vault"], revision: 3, reviewStartedAt: new Date(), createdAt: new Date(), updatedAt: new Date() },
  proposals: [{ id: "proposal", blueprintId: "blueprint", sortOrder: 1, name: "Vault", decision: "PENDING" }], materialization: null };
beforeEach(() => {
  vi.resetAllMocks();
  // The ORM's inferred array indexing type omits null, although an unmaterialized
  // review really returns null at runtime (covered by PostgreSQL and browser tests).
  vi.mocked(getBlueprintReview).mockResolvedValue(review as unknown as Awaited<ReturnType<typeof getBlueprintReview>>);
  vi.mocked(getOwnedBlueprint).mockResolvedValue(review.draft as Awaited<ReturnType<typeof getOwnedBlueprint>>);
});
test("consultation authorizes Blueprint ownership and only resolves its own proposals", async () => {
  expect(await readBlueprintProposalDraftAction("blueprint", "proposal")).toMatchObject({ ok: true, snapshot: {
    revision: 3, values: { name: "Vault", decision: "PENDING" }, unavailable: false,
  } });
  expect(getBlueprintReview).toHaveBeenCalledWith({}, { userId: "owner" }, "blueprint");
  expect(await readBlueprintProposalDraftAction("blueprint", "foreign-proposal")).toMatchObject({ ok: false });
  vi.mocked(getBlueprintReview).mockRejectedValue(new BlueprintNotFoundError());
  expect(await readBlueprintProposalDraftAction("foreign", "proposal")).toMatchObject({ ok: false });
  expect(decideBlueprintProposal).not.toHaveBeenCalled(); expect(revalidatePath).not.toHaveBeenCalled();
});
test("materialized proposals remain copyable but cannot be prepared", async () => {
  vi.mocked(getBlueprintReview).mockResolvedValue({ ...review, materialization: { campaignId: "campaign" } } as Awaited<ReturnType<typeof getBlueprintReview>>);
  expect(await readBlueprintProposalDraftAction("blueprint", "proposal")).toMatchObject({ ok: true, snapshot: { unavailable: true } });
});
test("pending creative name and decision do not merge when another proposal changes revision", () => {
  let state = initialPlanningDraft(blueprintProposalSnapshot(2, { name: "Vault", decision: "PENDING" }));
  state = planningDraftReducer(state, { type: "edit", values: { name: "Local vault", decision: "REJECTED" } });
  const latest = blueprintProposalSnapshot(3, { name: "Remote vault", decision: "ACCEPTED" });
  expect(planningDraftReducer(state, { type: "sync", snapshot: latest })).toBe(state);
  state = planningDraftReducer(state, { type: "consulted", snapshot: latest });
  const prepared = planningDraftReducer(state, { type: "prepare" });
  expect(prepared.base.revision).toBe(3); expect(prepared.values).toEqual({ name: "Local vault", decision: "REJECTED" });
});
test("decision adapter forwards exactly the original proposal, decision and base revision; late conflict reports no success", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(decideBlueprintProposal).mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
  const data = new FormData(); data.set("expectedRevision", "2"); data.set("name", "Local vault"); data.set("decision", "REJECTED");
  const result = decideBlueprintProposalAction("blueprint", "proposal", { message: "" }, data);
  await vi.waitFor(() => expect(decideBlueprintProposal).toHaveBeenCalledOnce());
  expect(decideBlueprintProposal).toHaveBeenCalledWith({}, { userId: "owner" }, "blueprint", "proposal", 2, "Local vault", "REJECTED");
  expect(revalidatePath).not.toHaveBeenCalled();
  reject(new BlueprintRevisionConflictError());
  expect(await result).toMatchObject({ conflict: true }); expect(await result).not.toHaveProperty("success"); expect(redirect).not.toHaveBeenCalled();
});
test("an accepted proposal reports confirmed success without redirecting or saving a sibling", async () => {
  vi.mocked(decideBlueprintProposal).mockResolvedValue(review.proposals[0] as Awaited<ReturnType<typeof decideBlueprintProposal>>);
  const data = new FormData(); data.set("expectedRevision", "2"); data.set("name", "Vault"); data.set("decision", "ACCEPTED");
  expect(await decideBlueprintProposalAction("blueprint", "proposal", { message: "" }, data)).toEqual({
    message: "Proposal saved. Other proposals were not saved.", success: { revision: 3 },
  });
  expect(decideBlueprintProposal).toHaveBeenCalledOnce(); expect(redirect).not.toHaveBeenCalled();
  expect(revalidatePath).toHaveBeenCalledWith("/blueprints/blueprint/review");
});
