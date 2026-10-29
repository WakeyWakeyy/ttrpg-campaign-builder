import { expect, type Page } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
export function planningEditor(page: Page, selector: string) {
  return page.locator("form").filter({ has: page.locator(selector) }).locator("..");
}
export async function planningCampaign(page: Page) {
  await setupClerkTestingToken({ page }); await page.goto("/");
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_EMAIL! }); await page.goto("/");
  const area = page.getByRole("region", { name: "Create campaign" });
  await area.getByLabel("Name", { exact: true }).fill("Planning drafts");
  await area.getByLabel("Original premise").fill("Preserve independent GM ideas.");
  await area.getByRole("button", { name: "Create campaign", exact: true }).click();
  await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]+$/);
  return page.url().split("/").pop()!;
}
export async function recoverPlanning(section: ReturnType<typeof planningEditor>, revision: number) {
  await section.getByRole("button", { name: "View persisted values for this section", exact: true }).click();
  await expect(section.getByRole("heading", { name: `Persisted section · revision ${revision}` })).toBeVisible();
  await section.getByRole("button", { name: "Keep this draft and use this revision", exact: true }).click();
  await expect(section.locator('input[name="expectedRevision"]')).toHaveValue(String(revision));
  await expect(section.getByRole("status").filter({ hasText: "without merging" })).toBeVisible();
}
