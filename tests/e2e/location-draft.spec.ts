import { test, expect, type Page } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { testPool } from "./database";

async function openLocation(page: Page) {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_EMAIL! });
  await page.goto("/");
  const campaign = page.getByRole("region", { name: "Create campaign" });
  await campaign.getByLabel("Name", { exact: true }).fill("Draft reliability");
  await campaign.getByLabel("Original premise").fill("Preserve the GM's ideas.");
  await campaign.getByRole("button", { name: "Create campaign", exact: true }).click();
  await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]+$/);
  const locations = page.getByRole("region", { name: "Locations" });
  await locations.getByLabel("Name", { exact: true }).fill("Harbor");
  await locations.getByLabel("Description (optional)").fill("Original description");
  await locations.getByRole("button", { name: "Create location", exact: true }).click();
  await expect(page).toHaveURL(/\/locations\/[0-9a-f-]+$/);
  return page.url().split("/").pop()!;
}

test("validation preserves every field, then corrected save persists and clears stale success feedback", async ({ page }) => {
  const pool = testPool();
  try {
    const id = await openLocation(page);
    const draft = "  An improvised idea\nA second line.\n";
    await page.getByLabel("Name", { exact: true }).fill("   ");
    await page.getByLabel("Description", { exact: true }).fill(draft);
    await page.getByRole("button", { name: "Save location", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Check the location fields");
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("   ");
    await expect(page.getByLabel("Description", { exact: true })).toHaveValue(draft);
    await expect(page.getByText("Location saved.", { exact: true })).toHaveCount(0);
    expect((await pool.query("SELECT name, description, revision FROM location JOIN campaign_entity USING (id, campaign_id) WHERE id = $1", [id])).rows[0])
      .toEqual({ name: "Harbor", description: "Original description", revision: 1 });
    await page.getByLabel("Name", { exact: true }).fill("  Revised harbor  ");
    await page.getByRole("button", { name: "Save location", exact: true }).click();
    await expect(page.getByRole("main").getByRole("status")).toHaveText("Location saved.");
    await expect(page.locator('input[name="expectedRevision"]')).toHaveValue("2");
    expect((await pool.query("SELECT name, description FROM location WHERE id = $1", [id])).rows[0])
      // Native multipart FormData uses CRLF; textarea.value uses LF.
      .toEqual({ name: "  Revised harbor  ", description: draft.replaceAll("\n", "\r\n") });
    await page.getByLabel("Description", { exact: true }).fill("");
    await expect(page.getByText("Location saved.", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Save location", exact: true }).click();
    await expect(page.locator('input[name="expectedRevision"]')).toHaveValue("3");
    await page.reload();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("  Revised harbor  ");
    await expect(page.getByLabel("Description", { exact: true })).toHaveValue("");
  } finally { await pool.end(); }
});

test("conflict recovery preserves the draft, only adopts a revision explicitly, and rejects another race", async ({ page, context }) => {
  const pool = testPool();
  const stale = await context.newPage();
  try {
    const id = await openLocation(page);
    await stale.goto(page.url());
    await stale.getByLabel("Name", { exact: true }).fill("My draft harbor");
    await stale.getByLabel("Description", { exact: true }).fill("  LOCAL IDEA\nStill editable.\n");
    await page.getByLabel("Name", { exact: true }).fill("Accepted harbor");
    await page.getByLabel("Description", { exact: true }).fill("Accepted idea");
    await page.getByRole("button", { name: "Save location", exact: true }).click();
    await expect(page.locator('input[name="expectedRevision"]')).toHaveValue("2");
    await stale.getByRole("button", { name: "Save location", exact: true }).click();
    await expect(stale.getByRole("main").getByRole("alert")).toContainText("Your draft is preserved");
    await expect(stale.getByLabel("Name", { exact: true })).toHaveValue("My draft harbor");
    await expect(stale.getByLabel("Description", { exact: true })).toHaveValue("  LOCAL IDEA\nStill editable.\n");
    await expect(stale.getByLabel("Description", { exact: true })).toBeEditable();
    await expect(stale.getByRole("button", { name: "Save location", exact: true })).toBeDisabled();
    await stale.getByRole("button", { name: "View persisted version" }).click();
    await expect(stale.getByRole("region", { name: /Persisted location/ })).toContainText("Accepted idea");
    await expect(stale.getByRole("region", { name: /Persisted location/ })).toContainText("Accepted harbor");
    await expect(stale.getByRole("region", { name: /Persisted location/ })).toContainText("does not merge persisted changes");
    await expect(stale.locator('input[name="expectedRevision"]')).toHaveValue("1");
    await expect(stale.getByLabel("Description", { exact: true })).toHaveValue("  LOCAL IDEA\nStill editable.\n");
    await stale.getByRole("button", { name: "Keep draft and use this revision" }).click();
    await expect(stale.locator('input[name="expectedRevision"]')).toHaveValue("2");
    await expect(stale.getByLabel("Name", { exact: true })).toHaveValue("My draft harbor");
    await expect(stale.getByLabel("Description", { exact: true })).toHaveValue("  LOCAL IDEA\nStill editable.\n");
    await expect(stale.getByRole("main").getByRole("alert")).toContainText("without merging persisted changes");
    await expect(stale.getByText("Location saved.", { exact: true })).toHaveCount(0);
    expect((await pool.query("SELECT description, revision FROM location JOIN campaign_entity USING (id, campaign_id) WHERE id = $1", [id])).rows[0])
      .toEqual({ description: "Accepted idea", revision: 2 });
    await page.getByLabel("Description", { exact: true }).fill("Changed again");
    await page.getByRole("button", { name: "Save location", exact: true }).click();
    await expect(page.locator('input[name="expectedRevision"]')).toHaveValue("3");
    await stale.getByRole("button", { name: "Save location", exact: true }).click();
    await expect(stale.getByRole("main").getByRole("alert")).toContainText("Your draft is preserved");
    await expect(stale.getByLabel("Description", { exact: true })).toHaveValue("  LOCAL IDEA\nStill editable.\n");
    await stale.getByRole("button", { name: "View persisted version" }).click();
    await expect(stale.getByRole("region", { name: /Persisted location/ })).toContainText("Changed again");
    await stale.getByRole("button", { name: "Keep draft and use this revision" }).click();
    await stale.getByRole("button", { name: "Save location", exact: true }).click();
    await expect(stale.getByRole("main").getByRole("status")).toHaveText("Location saved.");
    expect((await pool.query("SELECT name, description, revision FROM location JOIN campaign_entity USING (id, campaign_id) WHERE id = $1", [id])).rows[0])
      .toEqual({ name: "My draft harbor", description: "  LOCAL IDEA\r\nStill editable.\r\n", revision: 4 });
    await stale.reload();
    await expect(stale.getByLabel("Description", { exact: true })).toHaveValue("  LOCAL IDEA\nStill editable.\n");
  } finally { await stale.close(); await pool.end(); }
});

for (const intent of ["Archive", "Trash"]) {
  test(`${intent} preserves pending text locally without saving it or reporting a content save`, async ({ page }) => {
    const pool = testPool();
    try {
      const id = await openLocation(page);
      // Lifecycle commands must also work with an invalid pending name.
      await page.getByLabel("Name", { exact: true }).fill("   ");
      await page.getByLabel("Description", { exact: true }).fill("Unsaved local idea");
      await page.getByRole("button", { name: intent, exact: true }).click();
      await expect(page.getByRole("main").getByRole("status")).toHaveText(
        "Location status updated. Name and description were not saved; local text remains only in this page.");
      await expect(page.getByText("Location saved.", { exact: true })).toHaveCount(0);
      await expect(page.getByLabel("Name", { exact: true })).toHaveValue("   ");
      await expect(page.getByLabel("Description", { exact: true })).toHaveValue("Unsaved local idea");
      await expect(page.locator('input[name="expectedRevision"]')).toHaveValue("2");
      const row = (await pool.query("SELECT name, description, revision, archived_at, deleted_at FROM location JOIN campaign_entity USING (id, campaign_id) WHERE id = $1", [id])).rows[0];
      expect(row).toMatchObject({ name: "Harbor", description: "Original description", revision: 2 });
      expect(row.archived_at !== null).toBe(intent === "Archive");
      expect(row.deleted_at !== null).toBe(intent === "Trash");
      await page.reload();
      await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Harbor");
      await expect(page.getByLabel("Description", { exact: true })).toHaveValue("Original description");
    } finally { await pool.end(); }
  });
}

test("discard is explicit and Archive, Trash, Restore retain their existing semantics", async ({ page, context }) => {
  const pool = testPool();
  const stale = await context.newPage();
  try {
    const id = await openLocation(page);
    await stale.goto(page.url());
    await stale.getByLabel("Description", { exact: true }).fill("My discarded idea");
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(page.getByText("Archived", { exact: true })).toBeVisible();
    const archivedAt = (await pool.query("SELECT archived_at FROM campaign_entity WHERE id = $1", [id])).rows[0].archived_at;
    await page.getByRole("button", { name: "Trash", exact: true }).click();
    await expect(page.getByText("Trashed", { exact: true })).toBeVisible();
    await stale.getByRole("button", { name: "Save location", exact: true }).click();
    await expect(stale.getByRole("main").getByRole("alert")).toContainText("Your draft is preserved");
    await stale.getByRole("button", { name: "View persisted version" }).click();
    await expect(stale.getByRole("button", { name: "Keep draft and use this revision" })).toBeDisabled();
    await expect(stale.getByLabel("Description", { exact: true })).toHaveValue("My discarded idea");
    await stale.getByRole("button", { name: "Use persisted version (discard draft)" }).click();
    await expect(stale.getByLabel("Description", { exact: true })).toHaveValue("Original description");
    await stale.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(stale.getByText("Archived", { exact: true })).toBeVisible();
    expect((await pool.query("SELECT archived_at, deleted_at, purge_after FROM campaign_entity WHERE id = $1", [id])).rows[0])
      .toEqual({ archived_at: archivedAt, deleted_at: null, purge_after: null });
  } finally { await stale.close(); await pool.end(); }
});

test("a failed request keeps native values and never claims success", async ({ page }) => {
  await openLocation(page);
  await page.getByLabel("Name", { exact: true }).fill("Offline harbor");
  await page.getByLabel("Description", { exact: true }).fill("Unconfirmed draft");
  await page.route("**/locations/*", async route => {
    if (route.request().method() === "POST") await route.abort("failed");
    else await route.continue();
  });
  await page.getByRole("button", { name: "Save location", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Unable to confirm this request");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Offline harbor");
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue("Unconfirmed draft");
  await expect(page.getByText("Location saved.", { exact: true })).toHaveCount(0);
  await page.unroute("**/locations/*");
  await page.getByRole("button", { name: "View persisted version" }).click();
  await expect(page.getByRole("region", { name: /Persisted location/ })).toContainText("Original description");
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue("Unconfirmed draft");
});
