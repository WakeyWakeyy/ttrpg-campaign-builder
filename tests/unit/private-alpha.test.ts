import type { NextFetchEvent, NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const clerk = vi.hoisted(() => ({
  userId: null as string | null,
  bind: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (callback?: (auth: () => Promise<{ userId: string | null }>) => Promise<Response | undefined>, options?: unknown) => {
    clerk.bind(options);
    return () => callback?.(async () => ({ userId: clerk.userId }));
  },
}));

import proxy from "../../src/infrastructure/auth/clerk/proxy";
import { privateAlphaPolicy } from "../../src/infrastructure/auth/clerk/private-alpha";
import { requestError } from "../../src/app/request-error";

const origin = "https://alpha.example.com";
function request(path: string, method = "GET", host = origin) {
  return proxy({ method, nextUrl: new URL(path, host) } as NextRequest, {} as NextFetchEvent);
}
beforeEach(() => {
  clerk.userId = null;
  clerk.bind.mockClear();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_fixture");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_live_fixture");
  vi.stubEnv("PRIVATE_ALPHA_ORIGIN", origin);
  vi.stubEnv("PRIVATE_ALPHA_USER_IDS", "user_Tester");
});
afterEach(() => vi.unstubAllEnvs());

test("production fails closed on absent configuration, dev keys and preview", async () => {
  vi.stubEnv("PRIVATE_ALPHA_USER_IDS", "");
  expect((await request("/"))?.status).toBe(503);
  vi.stubEnv("PRIVATE_ALPHA_USER_IDS", "user_Tester");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fixture");
  expect((await request("/"))?.status).toBe(503);
  vi.stubEnv("CLERK_SECRET_KEY", "sk_live_fixture");
  vi.stubEnv("VERCEL_ENV", "preview");
  expect((await request("/"))?.status).toBe(503);
  expect(clerk.bind).not.toHaveBeenCalled();
});

test("the only anonymous application entry is the canonical sign-in landing", async () => {
  expect(await request("/")).toBeUndefined();
  expect((await request("/", "POST"))?.status).toBe(401);
  expect((await request("/campaigns/example/export/pdf"))?.status).toBe(401);
  expect(clerk.bind).toHaveBeenCalledWith({ authorizedParties: [origin] });
});

test("signed-in users require an invitation and cannot use another host", async () => {
  clerk.userId = "user_NotInvited";
  expect(await request("/")).toBeUndefined();
  for (const [path, method] of [["/", "POST"], ["/campaigns/example", "GET"], ["/sessions/example/sheet", "GET"]]) {
    const response = await request(path, method);
    expect(response?.status).toBe(404);
    expect(response?.headers.get("Cache-Control")).toBe("private, no-store");
  }
  clerk.userId = "user_Tester";
  expect(await request("/campaigns/example")).toBeUndefined();
  expect((await request("/campaigns/example", "GET", "https://preview.example.com"))?.status).toBe(404);
});

test("local development keeps its original auth flow with blank sample settings", () => {
  expect(privateAlphaPolicy({ NODE_ENV: "development", PRIVATE_ALPHA_ORIGIN: "", PRIVATE_ALPHA_USER_IDS: "" })).toBeNull();
});

test("production errors omit database and provider diagnostics", () => {
  const source = new Error("private campaign content", { cause: { token: "provider-diagnostic" } });
  expect(requestError(source)).toEqual(new Error("Unable to complete the request."));
  expect((requestError(source) as Error).cause).toBeUndefined();
});
