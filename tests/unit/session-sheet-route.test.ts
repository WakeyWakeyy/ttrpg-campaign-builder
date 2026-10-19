import { beforeEach, expect, test, vi } from "vitest";
import { UnauthenticatedError } from "../../src/modules/identity";
import { SessionNotFoundError } from "../../src/modules/sessions";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), sheet: vi.fn() }));
vi.mock("@/infrastructure/auth/clerk/require-actor", () => ({ requireActor: mocks.actor }));
vi.mock("@/infrastructure/db/server", () => ({ getDatabase: () => ({}) }));
vi.mock("@/modules/export/session-sheet", async importOriginal => ({
  ...await importOriginal<typeof import("../../src/modules/export/session-sheet")>(), buildSessionSheet: mocks.sheet,
}));
import { GET } from "../../src/app/sessions/[sessionId]/sheet/route";

const request = (query = "") => GET(new Request(`https://campaign.example/sessions/gate/sheet${query}`), {
  params: Promise.resolve({ sessionId: "gate" }),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue({ userId: "owner" });
  mocks.sheet.mockResolvedValue({ campaignName: "Coast", title: "Gate", plannedFor: null, preparation: null,
    attendance: null, previous: null, scenes: [], encounters: [] });
});

test.each(["", "?format=md", "?format=pdf"])("authorized sheet download %s returns a private attachment", async query => {
  const response = await request(query);
  const pdf = query === "?format=pdf";
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe(pdf ? "application/pdf" : "text/markdown; charset=utf-8");
  expect(response.headers.get("content-disposition")).toBe(`attachment; filename="session-gate.${pdf ? "pdf" : "md"}"`);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(mocks.sheet).toHaveBeenCalledWith({}, { userId: "owner" }, "gate");
  if (pdf) expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
  else expect(await response.text()).toContain("# Gate");
});

test.each(["", "?format=pdf"])("unauthenticated request %s cannot collect session material", async query => {
  mocks.actor.mockRejectedValue(new UnauthenticatedError());
  expect((await request(query)).status).toBe(401);
  expect(mocks.sheet).not.toHaveBeenCalled();
});

test.each(["", "?format=pdf"])("foreign or missing session %s returns the same 404", async query => {
  mocks.sheet.mockRejectedValue(new SessionNotFoundError());
  const response = await request(query);
  expect(response.status).toBe(404);
  expect(await response.text()).toBe("Not found");
});

test("unsupported formats do not authenticate or collect records", async () => {
  expect((await request("?format=html")).status).toBe(404);
  expect(mocks.actor).not.toHaveBeenCalled();
  expect(mocks.sheet).not.toHaveBeenCalled();
});
