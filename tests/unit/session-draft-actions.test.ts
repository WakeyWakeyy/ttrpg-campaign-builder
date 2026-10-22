import { beforeEach, expect, test, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { editScene, getOwnedSession, listSessionScenes, recordSessionOutcome, SessionRevisionConflictError } from "@/modules/sessions";
import { readSessionDraftAction } from "../../src/app/session-draft-actions";
import { recordSessionOutcomeAction, updateSceneAction } from "../../src/app/actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/infrastructure/db/server", () => ({ getDatabase: () => ({}) }));
vi.mock("@/infrastructure/auth/clerk/require-actor", () => ({ requireActor: async () => ({ userId: "owner" }) }));
vi.mock("@/modules/sessions", async importOriginal => ({
  ...await importOriginal<typeof import("@/modules/sessions")>(),
  getOwnedSession: vi.fn(), listSessionScenes: vi.fn(), editScene: vi.fn(), recordSessionOutcome: vi.fn(),
}));
const parent = { id: "session", title: "Crossing", preparation: "Plan", outcome: "Result", deletedAt: null, revision: 3 };
const beat = { id: "scene", title: "Gate", preparation: "Beat plan", outcome: "Beat result", position: 1, deletedAt: null };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getOwnedSession).mockResolvedValue(parent as Awaited<ReturnType<typeof getOwnedSession>>);
  vi.mocked(listSessionScenes).mockResolvedValue([beat] as Awaited<ReturnType<typeof listSessionScenes>>);
});

test("consultation is owner/session scoped and does not mutate or invalidate", async () => {
  const result = await readSessionDraftAction("session", { kind: "scene-outcome", sceneId: "scene" });
  expect(result).toEqual({ ok: true, snapshot: { revision: 3, values: { outcome: "Beat result" }, unavailable: false } });
  expect(getOwnedSession).toHaveBeenCalledWith({}, { userId: "owner" }, "session");
  expect(listSessionScenes).toHaveBeenCalledWith({}, { userId: "owner" }, "session");
  expect(editScene).not.toHaveBeenCalled();
  expect(revalidatePath).not.toHaveBeenCalled();
});

test("a missing or other-session scene is not returned by the recovery adapter", async () => {
  expect(await readSessionDraftAction("session", { kind: "scene", sceneId: "another-session-scene" }))
    .toEqual({ ok: false, message: "Scene not found or unavailable." });
});

test("trashed scene snapshots cannot be prepared, but preserve values to compare/copy", async () => {
  vi.mocked(listSessionScenes).mockResolvedValue([{ ...beat, deletedAt: new Date() }] as Awaited<ReturnType<typeof listSessionScenes>>);
  expect(await readSessionDraftAction("session", { kind: "scene", sceneId: "scene" }))
    .toMatchObject({ ok: true, snapshot: { unavailable: true, values: { preparation: "Beat plan" } } });
});

test("outcome save sends only outcome and the original expectedRevision", async () => {
  vi.mocked(recordSessionOutcome).mockResolvedValue(parent as Awaited<ReturnType<typeof recordSessionOutcome>>);
  const form = new FormData();
  form.set("expectedRevision", "2"); form.set("outcome", "Local result"); form.set("preparation", "Do not write this");
  expect(await recordSessionOutcomeAction("session", { message: "" }, form))
    .toMatchObject({ success: { revision: 3 } });
  expect(recordSessionOutcome).toHaveBeenCalledWith({}, { userId: "owner" }, "session", { expectedRevision: 2, outcome: "Local result" });
  expect(redirect).not.toHaveBeenCalled();
  expect(revalidatePath).toHaveBeenCalledWith("/sessions/session/recap");
});

test("scene save waits for command completion; a late conflict never reports success", async () => {
  const form = new FormData();
  for (const [key, value] of Object.entries({ expectedRevision: "2", intent: "save", title: "Local gate", preparation: "Local plan", outcome: "", position: "1" })) form.set(key, value);
  let reject!: (reason: Error) => void;
  vi.mocked(editScene).mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
  const result = updateSceneAction("session", "scene", { message: "" }, form);
  await vi.waitFor(() => expect(editScene).toHaveBeenCalledOnce());
  expect(revalidatePath).not.toHaveBeenCalled();
  expect(editScene).toHaveBeenCalledWith({}, { userId: "owner" }, "session", "scene", {
    expectedRevision: 2, intent: "save", title: "Local gate", preparation: "Local plan", outcome: null, position: 1,
  });
  reject(new SessionRevisionConflictError());
  expect(await result).toMatchObject({ conflict: true });
  expect(await result).not.toHaveProperty("success");
  expect(revalidatePath).not.toHaveBeenCalled();
  expect(redirect).not.toHaveBeenCalled();
});
