import { test, expect, type Page } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { testPool } from "./database";
import { recoverPlanning } from "./planning-draft-helpers";
async function openReview(page: Page) {
  await setupClerkTestingToken({ page }); await page.goto("/");
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_EMAIL! }); await page.goto("/");
  await page.getByText("Start a blueprint draft", { exact: true }).click();
  await page.locator("#draft-title").fill("Independent proposal drafts");
  await page.locator("#draft-premise").fill("A resurfacing city.");
  await page.locator("#draft-locations").fill("Harbor\nVault");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/blueprints\/[0-9a-f-]+$/);
  const id = page.url().split("/").pop()!;
  await page.getByRole("button", { name: "Start Blueprint Review", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/blueprints/${id}/review$`));
  return id;
}
function proposal(page: Page, index: number) {
  return page.locator("form").filter({ has: page.locator('[id^="name-"]') }).nth(index).locator("..");
}
test("proposal names and decisions survive sibling saves, validation, explicit recovery and another race", async ({ page, context }) => {
  const pool = testPool(), other = await context.newPage();
  try {
    const id = await openReview(page), first = proposal(page, 0), second = proposal(page, 1);
    await second.getByLabel("Location name").fill("Local vault");
    await second.getByLabel("Decision").selectOption("ACCEPTED");
    await first.getByLabel("Location name").fill("Accepted harbor");
    await first.getByLabel("Decision").selectOption("ACCEPTED");
    await first.getByRole("button", { name: "Save proposal", exact: true }).click();
    await expect(first.getByRole("status").filter({ hasText: /^Proposal saved\./ })).toHaveText("Proposal saved. Other proposals were not saved.");
    await expect(first.locator('input[name="expectedRevision"]')).toHaveValue("3");
    await expect(second.getByLabel("Location name")).toHaveValue("Local vault");
    await expect(second.getByLabel("Decision")).toHaveValue("ACCEPTED");
    await expect(second.locator('input[name="expectedRevision"]')).toHaveValue("2");
    await expect(second.getByRole("button", { name: "Save proposal", exact: true })).toBeDisabled();
    await expect(page.getByText("1 accepted Location:", { exact: true })).toBeVisible();
    expect((await pool.query("SELECT name, decision FROM blueprint_proposal WHERE blueprint_id=$1 ORDER BY sort_order", [id])).rows)
      .toEqual([{ name: "Accepted harbor", decision: "ACCEPTED" }, { name: "Vault", decision: "PENDING" }]);
    await first.getByLabel("Location name").fill("Pending harbor"); await first.getByLabel("Decision").selectOption("REJECTED");
    await recoverPlanning(second, 3);
    await second.getByLabel("Location name").fill("   ");
    await second.getByRole("button", { name: "Save proposal", exact: true }).click();
    await expect(second.getByRole("alert")).toBeVisible();
    await expect(second.getByLabel("Location name")).toHaveValue("   "); await expect(second.getByLabel("Decision")).toHaveValue("ACCEPTED");
    await second.getByLabel("Location name").fill("Local vault");
    await second.getByRole("button", { name: "Save proposal", exact: true }).click();
    await expect(second.locator('input[name="expectedRevision"]')).toHaveValue("4");
    await expect(first.getByLabel("Location name")).toHaveValue("Pending harbor");
    await expect(first.getByLabel("Decision")).toHaveValue("REJECTED");
    await expect(first.locator('input[name="expectedRevision"]')).toHaveValue("3");
    await recoverPlanning(first, 4);
    await other.goto(page.url());
    const remote = proposal(other, 1);
    await remote.getByLabel("Location name").fill("Remote vault"); await remote.getByLabel("Decision").selectOption("REJECTED");
    await remote.getByRole("button", { name: "Save proposal", exact: true }).click();
    await expect(remote.locator('input[name="expectedRevision"]')).toHaveValue("5");
    await first.getByRole("button", { name: "Save proposal", exact: true }).click();
    await expect(first.getByRole("alert")).toContainText("draft is retained");
    await expect(first.getByLabel("Decision")).toHaveValue("REJECTED"); await expect(first.getByLabel("Location name")).toHaveValue("Pending harbor");
    expect((await pool.query("SELECT name, decision FROM blueprint_proposal WHERE blueprint_id=$1 ORDER BY sort_order", [id])).rows)
      .toEqual([{ name: "Accepted harbor", decision: "ACCEPTED" }, { name: "Remote vault", decision: "REJECTED" }]);
    await first.getByRole("button", { name: "View persisted values for this section", exact: true }).click();
    await expect(first.getByRole("heading", { name: "Persisted section · revision 5" })).toBeVisible();
    await expect(first.getByLabel("Decision")).toHaveValue("REJECTED");
    await first.getByRole("button", { name: "Load persisted values (discard this draft)", exact: true }).click();
    await expect(first.getByLabel("Location name")).toHaveValue("Accepted harbor"); await expect(first.getByLabel("Decision")).toHaveValue("ACCEPTED");
    expect((await pool.query("SELECT count(*)::int AS count FROM blueprint_materialization WHERE blueprint_id=$1", [id])).rows[0].count).toBe(0);
  } finally { await other.close(); await pool.end(); }
});

test("pending local acceptance and renaming never materialize without saving that proposal", async ({ page }) => {
  const pool = testPool();
  try {
    const id = await openReview(page), first = proposal(page, 0), second = proposal(page, 1);
    await second.getByLabel("Location name").fill("UNSAVED ACCEPTED IDEA"); await second.getByLabel("Decision").selectOption("ACCEPTED");
    await first.getByLabel("Decision").selectOption("ACCEPTED");
    await first.getByRole("button", { name: "Save proposal", exact: true }).click();
    await expect(first.locator('input[name="expectedRevision"]')).toHaveValue("3");
    await expect(second.getByLabel("Location name")).toHaveValue("UNSAVED ACCEPTED IDEA"); await expect(second.getByLabel("Decision")).toHaveValue("ACCEPTED");
    await expect(page.getByText("1 accepted Location:", { exact: true })).toBeVisible();
    // This is an explicit navigation-producing command; general navigation protection is out of scope.
    await page.getByRole("button", { name: "Create Campaign from accepted proposals", exact: true }).click();
    await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]+$/);
    const campaignId = page.url().split("/").pop()!;
    expect((await pool.query("SELECT name FROM location WHERE campaign_id=$1", [campaignId])).rows).toEqual([{ name: "Harbor" }]);
    expect((await pool.query("SELECT name, decision FROM blueprint_proposal WHERE blueprint_id=$1 ORDER BY sort_order", [id])).rows)
      .toEqual([{ name: "Harbor", decision: "ACCEPTED" }, { name: "Vault", decision: "PENDING" }]);
    expect((await pool.query("SELECT count(*)::int AS count FROM blueprint_materialization WHERE blueprint_id=$1", [id])).rows[0].count).toBe(1);
  } finally { await pool.end(); }
});
