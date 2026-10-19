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

const request = (format = "quick-reference") => GET(new Request(`https://campaign.example/campaigns/coast/export/${format}`), {
  params: Promise.resolve({ campaignId: "coast", format }),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue({ userId: "owner" });
  mocks.snapshot.mockResolvedValue({ campaign: { id: "coast", name: "Coast" }, ruleset: { name: "Rules", key: "srd", version: "1" }, records: {} });
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

test.each(["quick-reference", "pdf"])("unauthenticated %s downloads cannot collect campaign records", async format => {
  mocks.actor.mockRejectedValue(new UnauthenticatedError());
  expect((await request(format)).status).toBe(401);
  expect(mocks.snapshot).not.toHaveBeenCalled();
});

test.each(["quick-reference", "pdf"])("%s downloads do not reveal another owner's campaign", async format => {
  mocks.snapshot.mockRejectedValue(new CampaignNotFoundError());
  const response = await request(format);
  expect(response.status).toBe(404);
  expect(await response.text()).toBe("Not found");
});

test("PDF download returns a real private attachment from the authorized snapshot", async () => {
  const response = await request("pdf");
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/pdf");
  expect(response.headers.get("content-disposition")).toBe('attachment; filename="campaign-coast.pdf"');
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(mocks.snapshot).toHaveBeenCalledWith({}, { userId: "owner" }, "coast");
  expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("unknown formats do not authenticate or collect records", async () => {
  expect((await request("html")).status).toBe(404);
  expect(mocks.actor).not.toHaveBeenCalled();
  expect(mocks.snapshot).not.toHaveBeenCalled();
});
