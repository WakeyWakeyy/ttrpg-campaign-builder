import { beforeEach, expect, test, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { archiveLocation, trashLocation, editLocation, getOwnedLocation, InvalidLocationInputError, LocationNotFoundError, LocationRevisionConflictError } from "@/modules/locations";
import { readLocationAction, updateLocationAction } from "../../src/app/location-actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/infrastructure/db/server", () => ({ getDatabase: () => ({}) }));
vi.mock("@/infrastructure/auth/clerk/require-actor", () => ({ requireActor: vi.fn() }));
vi.mock("@/modules/locations", async importOriginal => ({
  ...await importOriginal<typeof import("@/modules/locations")>(),
  editLocation: vi.fn(), getOwnedLocation: vi.fn(), archiveLocation: vi.fn(), trashLocation: vi.fn(),
}));

const location = { id: "location", campaignId: "campaign", name: "Harbor", description: "New text",
  revision: 2, archivedAt: null, deletedAt: null };
const actor = { userId: "internal-user" };
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ name: "  Harbor  ", description: "  Idea\n", expectedRevision: "1", intent: "save" })) data.set(key, value);
  return data;
}
beforeEach(() => { vi.resetAllMocks(); vi.mocked(requireActor).mockResolvedValue(actor); });

test.each([new InvalidLocationInputError("name"), new LocationRevisionConflictError(), new Error("Failed transaction")])(
  "rejected writes return no success snapshot or cache invalidation (%s)", async error => {
    vi.mocked(editLocation).mockRejectedValue(error);
    const result = await updateLocationAction(location.id, form());
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("location");
    expect(revalidatePath).not.toHaveBeenCalled();
    if (error instanceof LocationRevisionConflictError) expect(result).toMatchObject({ conflict: true });
  });

test("success waits for the command and preserves raw field values and expectedRevision", async () => {
  let commit!: () => void;
  vi.mocked(editLocation).mockImplementation(async () => {
    await new Promise<void>(resolve => { commit = resolve; });
    return location as Awaited<ReturnType<typeof editLocation>>;
  });
  const pending = updateLocationAction(location.id, form());
  await vi.waitFor(() => expect(editLocation).toHaveBeenCalledOnce());
  expect(editLocation).toHaveBeenCalledWith({}, actor, location.id, {
    expectedRevision: 1, name: "  Harbor  ", description: "  Idea\n",
  });
  expect(revalidatePath).not.toHaveBeenCalled();
  commit();
  expect(await pending).toEqual({ ok: true, location: {
    id: location.id, name: location.name, description: location.description,
    revision: 2, archivedAt: null, deletedAt: null,
  } });
  expect(revalidatePath).toHaveBeenCalledWith("/campaigns/campaign");
  expect(revalidatePath).toHaveBeenCalledWith("/locations/location");
});

test("consultation resolves the Actor and uses the owner-scoped read without writing", async () => {
  vi.mocked(getOwnedLocation).mockResolvedValue(location as Awaited<ReturnType<typeof getOwnedLocation>>);
  expect(await readLocationAction(location.id)).toMatchObject({ ok: true, location: { revision: 2 } });
  expect(getOwnedLocation).toHaveBeenCalledWith({}, actor, location.id);
  expect(editLocation).not.toHaveBeenCalled();
  expect(revalidatePath).not.toHaveBeenCalled();
});

test("consultation does not expose unavailable or unowned records", async () => {
  vi.mocked(getOwnedLocation).mockRejectedValue(new LocationNotFoundError());
  expect(await readLocationAction(location.id)).toEqual({ ok: false, message: "Location not found or unavailable." });
});

test.each([
  { intent: "archive", command: archiveLocation },
  { intent: "trash", command: trashLocation },
])("$intent ignores pending content and only calls the revision-safe lifecycle command", async ({ intent, command }) => {
  vi.mocked(command).mockResolvedValue(location as Awaited<ReturnType<typeof archiveLocation>>);
  const pending = form();
  pending.set("intent", intent);
  pending.set("name", "   ");
  pending.set("description", "Unsaved local idea");
  expect(await updateLocationAction(location.id, pending)).toMatchObject({ ok: true, location: { revision: 2 } });
  expect(command).toHaveBeenCalledWith({}, actor, location.id, 1);
  expect(editLocation).not.toHaveBeenCalled();
});
