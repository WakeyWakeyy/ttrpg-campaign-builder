import { beforeEach, expect, test, vi } from "vitest";
import { CampaignNotFoundError } from "../../src/modules/campaigns";
import { UnauthenticatedError } from "../../src/modules/identity";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), snapshot: vi.fn() }));
vi.mock("@/infrastructure/auth/clerk/require-actor", () => ({ requireActor: mocks.actor }));
vi.mock("@/infrastructure/db/server", () => ({ getDatabase: () => ({}) }));
vi.mock("@/modules/export", async importOriginal => ({
  ...await importOriginal<typeof import("../../src/modules/export")>(), buildCampaignExport: mocks.snapshot,
}));
import { GET } from "../../src/app/campaigns/[campaignId]/export/[format]/route";

const request = () => GET(new Request("https://campaign.example/campaigns/coast/export/quick-reference"), {
  params: Promise.resolve({ campaignId: "coast", format: "quick-reference" }),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue({ userId: "owner" });
  mocks.snapshot.mockResolvedValue({ campaign: { id: "coast", name: "Coast" }, records: {} });
});

test("quick-reference download uses the authorized snapshot and private attachment headers", async () => {
  const response = await request();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
  expect(response.headers.get("content-disposition")).toBe('attachment; filename="campaign-coast-quick-reference.md"');
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(mocks.snapshot).toHaveBeenCalledWith({}, { userId: "owner" }, "coast");
  expect(await response.text()).toContain("# Coast — Quick reference");
});

test("unauthenticated downloads cannot collect campaign records", async () => {
  mocks.actor.mockRejectedValue(new UnauthenticatedError());
  expect((await request()).status).toBe(401);
  expect(mocks.snapshot).not.toHaveBeenCalled();
});

test("downloads do not reveal another owner's campaign", async () => {
  mocks.snapshot.mockRejectedValue(new CampaignNotFoundError());
  const response = await request();
  expect(response.status).toBe(404);
  expect(await response.text()).toBe("Not found");
});
