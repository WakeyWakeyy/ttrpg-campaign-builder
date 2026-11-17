import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

const mode = process.env.PRIVATE_ALPHA_ACCESS_SMOKE;
const sampleId = "019a1111-1111-7111-8111-111111111111";

test("private alpha gates authenticated access and other deployment hosts", async ({ page, baseURL }) => {
  test.skip(mode !== "allowed" && mode !== "denied", "Run with the local Private Alpha roster configured.");
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign in to your campaigns" })).toBeVisible();
  const anonymousExport = await page.request.get(`/campaigns/${sampleId}/export/pdf`);
  expect(anonymousExport.status()).toBe(401);

  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_EMAIL! });
  await page.goto("/");
  if (mode === "allowed") {
    await expect(page.getByRole("heading", { name: "Your campaigns" })).toBeVisible();
  } else {
    await expect(page.getByRole("heading", { name: "Invitation required" })).toBeVisible();
    const denied = await page.request.get(`/sessions/${sampleId}/sheet?format=pdf`);
    expect(denied.status()).toBe(404);
    expect(denied.headers()["cache-control"]).toBe("private, no-store");
  }

  const alternateHost = new URL(baseURL!);
  alternateHost.hostname = "127.0.0.1";
  expect((await page.request.get(alternateHost.href)).status()).toBe(404);
});
