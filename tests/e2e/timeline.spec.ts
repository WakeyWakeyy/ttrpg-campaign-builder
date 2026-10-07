import { test, expect } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { testPool } from "./database";

test("record, edit, and restore a linked Timeline event", async ({ page }) => {
  const pool = testPool();
  try {
    await setupClerkTestingToken({ page });
    await page.goto("/");
    await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_EMAIL! });
    await page.goto("/");
    const campaignForm = page.getByRole("region", { name: "Create campaign" });
    await campaignForm.getByLabel("Name", { exact: true }).fill("Timeline E2E");
    await campaignForm.getByLabel("Original premise").fill("An old kingdom remembers.");
    await campaignForm.getByRole("button", { name: "Create campaign", exact: true }).click();
    await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]+$/);
    const campaignId = page.url().split("/").pop()!;

    const location = page.getByRole("region", { name: "Locations" });
    await location.getByLabel("Name").fill("Old Keep");
    await location.getByRole("button", { name: "Create location" }).click();
    await expect(page).toHaveURL(/\/locations\/[0-9a-f-]+$/);
    await page.goto(`/campaigns/${campaignId}`);

    const timeline = page.getByRole("region", { name: "Timeline" });
    await timeline.getByLabel("Title").fill("The crossing");
    await timeline.getByLabel("What happened (optional)").fill("A pact was made.");
    await timeline.getByLabel("Real date (optional)").fill("2026-10-07");
    await timeline.getByLabel("In-world date (optional)").fill("Third day of Ember");
    await timeline.getByLabel("Location: Old Keep").check();
    await timeline.getByRole("button", { name: "Record event" }).click();
    await expect(page).toHaveURL(/\/timeline\/[0-9a-f-]+$/);
    const eventId = page.url().split("/").pop()!;
    await expect(page.getByRole("region", { name: "Related entities" })).toContainText("Old Keep");
    await page.getByLabel("Title").fill("The return");
    await page.getByRole("button", { name: "Save event" }).click();
    await expect(page.getByRole("heading", { name: "The return" })).toBeVisible();
    await page.getByRole("button", { name: "Archive" }).click();
    await page.getByRole("button", { name: "Trash" }).click();
    await page.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByText("Archived", { exact: true })).toBeVisible();
    await page.goto(`/campaigns/${campaignId}`);
    await expect(page.getByRole("region", { name: "Timeline" }).getByRole("link", { name: "The return" })).toBeVisible();
    expect((await pool.query("SELECT title, in_world_date FROM timeline_event WHERE id = $1", [eventId])).rows[0])
      .toEqual({ title: "The return", in_world_date: "Third day of Ember" });
  } finally { await pool.end(); }
});
