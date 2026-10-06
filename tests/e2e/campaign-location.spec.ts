import { test, expect } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { testPool } from "./database";

test("internal Actor, Campaign, Location, stale edit and Archive/Trash/Restore", async ({ page, context }) => {
  const pool = testPool();
  try {
    await setupClerkTestingToken({ page });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Sign in to your campaigns" })).toBeVisible();
    await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_EMAIL! });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Your campaigns" })).toBeVisible();
    const identities = await pool.query("SELECT user_id FROM auth_identity WHERE provider = 'clerk'");
    expect(identities.rows).toHaveLength(1);
    const actorId = identities.rows[0].user_id;
    expect((await pool.query("SELECT id FROM user_account WHERE id = $1", [actorId])).rowCount).toBe(1);

    await page.getByLabel("Name", { exact: true }).fill("A10 campaign");
    await page.getByLabel("Original premise").fill("Explore the harbor.");
    await page.getByRole("button", { name: "Create campaign", exact: true }).click();
    await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]+$/);
    const campaignId = page.url().split("/").pop();
    expect((await pool.query("SELECT owner_user_id FROM campaign WHERE id = $1", [campaignId])).rows[0].owner_user_id).toBe(actorId);
    await page.getByRole("link", { name: "All campaigns" }).click();
    await page.getByRole("link", { name: "A10 campaign", exact: true }).click();
    await expect(page.getByRole("heading", { name: "A10 campaign", exact: true })).toBeVisible();
    await page.getByLabel("Name", { exact: true }).fill("Harbor");
    await page.getByLabel("Description (optional)").fill("Original description");
    await page.getByRole("button", { name: "Create location", exact: true }).click();
    await expect(page).toHaveURL(/\/locations\/[0-9a-f-]+$/);
    await expect(page.getByText("Active", { exact: true })).toBeVisible();
    const locationId = page.url().split("/").pop();
    const stale = await context.newPage();
    await stale.goto(page.url());
    await expect(stale.getByLabel("Description", { exact: true })).toHaveValue("Original description");
    const revision = await stale.locator('input[name="expectedRevision"]').inputValue();
    await page.getByLabel("Description", { exact: true }).fill("Accepted newer description");
    await page.getByRole("button", { name: "Save location", exact: true }).click();
    await expect(page.locator('input[name="expectedRevision"]')).toHaveValue(String(Number(revision) + 1));
    await stale.getByLabel("Description", { exact: true }).fill("Stale overwrite");
    await stale.getByRole("button", { name: "Save location", exact: true }).click();
    await expect(stale.getByRole("main").getByRole("alert")).toHaveText("This location changed since you opened it. Reload before saving again.");
    await expect(stale.getByRole("button", { name: "Save location", exact: true })).toBeDisabled();
    const saved = await pool.query("SELECT description, revision FROM location JOIN campaign_entity USING (id, campaign_id) WHERE id = $1", [locationId]);
    expect(saved.rows[0]).toEqual({ description: "Accepted newer description", revision: Number(revision) + 1 });
    await stale.getByRole("button", { name: "Reload location" }).click();
    await expect(stale.getByLabel("Description", { exact: true })).toHaveValue("Accepted newer description");
    await expect(stale.getByRole("button", { name: "Save location", exact: true })).toBeEnabled();
    await stale.close();

    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(page.getByText("Archived", { exact: true })).toBeVisible();
    const archived = (await pool.query("SELECT archived_at FROM campaign_entity WHERE id = $1", [locationId])).rows[0].archived_at;
    expect(archived).not.toBeNull();
    await page.getByRole("button", { name: "Trash", exact: true }).click();
    await expect(page.getByText("Trashed", { exact: true })).toBeVisible();
    await expect(page.getByText("Restore returns this location to Archived.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(page.getByText("Archived", { exact: true })).toBeVisible();
    expect((await pool.query("SELECT archived_at, deleted_at, purge_after FROM campaign_entity WHERE id = $1", [locationId])).rows[0]).toEqual({ archived_at: archived, deleted_at: null, purge_after: null });
    await page.reload();
    await expect(page.getByText("Archived", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Description", { exact: true })).toHaveValue("Accepted newer description");
    await page.getByRole("link", { name: "Back to campaign" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Harbor" })).toContainText("Archived");
  } finally { await pool.end(); }
});
