import { test, expect } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { testPool } from "./database";

test("prepare a session, record its outcome, and restore it", async ({ page }) => {
  const pool = testPool();
  try {
    await setupClerkTestingToken({ page });
    await page.goto("/");
    await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_EMAIL! });
    await page.goto("/");
    const campaignForm = page.getByRole("region", { name: "Create campaign" });
    await campaignForm.getByLabel("Name", { exact: true }).fill("Sessions E2E");
    await campaignForm.getByLabel("Original premise").fill("A voyage across the sea.");
    await campaignForm.getByRole("button", { name: "Create campaign", exact: true }).click();
    await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]+$/);
    const campaignId = page.url().split("/").pop()!;

    const sessions = page.getByRole("region", { name: "Sessions" });
    await sessions.getByLabel("Title").fill("The crossing");
    await sessions.getByLabel("Planned date (optional)").fill("2026-10-08");
    await sessions.getByLabel("Preparation").fill("Meet the ferryman.");
    await sessions.getByRole("button", { name: "Create session" }).click();
    await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]+$/);
    const sessionId = page.url().split("/").pop()!;
    await expect(page.getByLabel("Preparation").first()).toHaveValue("Meet the ferryman.");
    await page.getByLabel("What actually happened (optional)").fill("The party crossed by boat.");
    await page.getByRole("button", { name: "Save session" }).click();
    await expect(page.locator('input[name="expectedRevision"]').first()).toHaveValue("2");
    await expect(page.getByLabel("What actually happened (optional)")).toHaveValue("The party crossed by boat.");
    await page.getByLabel("Title", { exact: true }).last().fill("At the bridge");
    await page.getByLabel("Preparation", { exact: true }).last().fill("A toll keeper waits.");
    await page.getByRole("button", { name: "Add scene" }).click();
    await expect(page.locator('input[name="expectedRevision"]').first()).toHaveValue("3");
    await expect(page.getByRole("heading", { name: "At the bridge" })).toBeVisible();
    await page.getByLabel("What happened").fill("The party paid the toll.");
    await page.getByRole("button", { name: "Save scene" }).click();
    await expect(page.locator('input[name="expectedRevision"]').first()).toHaveValue("4");
    await page.getByRole("link", { name: "Open Run View" }).click();
    await expect(page).toHaveURL(new RegExp(`/sessions/${sessionId}/run$`));
    await expect(page.getByRole("heading", { name: "The crossing" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "At the bridge" })).toBeVisible();
    await expect(page.getByText("A toll keeper waits.")).toBeVisible();
    await page.getByRole("link", { name: "Edit session" }).click();
    await page.getByRole("button", { name: "Trash scene" }).click();
    await expect(page.getByRole("heading", { name: /At the bridge · In trash/ })).toBeVisible();
    await page.getByRole("button", { name: "Restore scene" }).click();
    await expect(page.locator('input[name="expectedRevision"]').first()).toHaveValue("6");
    await expect(page.getByLabel("What happened")).toHaveValue("The party paid the toll.");
    await page.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByText("Archived", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Trash", exact: true }).click();
    await expect(page.getByText("In trash", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(page.getByText("Archived", { exact: true })).toBeVisible();
    await page.goto(`/campaigns/${campaignId}`);
    await expect(page.getByRole("region", { name: "Sessions" }).getByRole("link", { name: "The crossing" })).toBeVisible();
    expect((await pool.query("SELECT title, planned_for::text AS planned_for, preparation, outcome FROM session WHERE id = $1", [sessionId])).rows[0])
      .toEqual({ title: "The crossing", planned_for: "2026-10-08",
        preparation: "Meet the ferryman.", outcome: "The party crossed by boat." });
    expect((await pool.query("SELECT title, preparation, outcome, deleted_at FROM scene WHERE session_id = $1", [sessionId])).rows[0])
      .toMatchObject({ title: "At the bridge", preparation: "A toll keeper waits.",
        outcome: "The party paid the toll.", deleted_at: null });
  } finally { await pool.end(); }
});
