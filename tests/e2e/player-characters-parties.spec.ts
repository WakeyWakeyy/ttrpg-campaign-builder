import { test, expect, type Page } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { testPool } from "./database";

async function createCampaign(page: Page) {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_EMAIL! });
  await page.goto("/");
  const form = page.getByRole("region", { name: "Create campaign" });
  await form.getByLabel("Name", { exact: true }).fill("Characters and parties E2E");
  await form.getByLabel("Original premise").fill("A shared journey.");
  await form.getByRole("button", { name: "Create campaign", exact: true }).click();
  await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]+$/);
  return page.url().split("/").pop()!;
}

async function createCharacter(page: Page, campaignId: string, name: string) {
  await page.goto(`/campaigns/${campaignId}`);
  const region = page.getByRole("region", { name: "Player Characters" });
  await region.getByLabel("Character name").fill(name);
  await region.getByRole("button", { name: "Create character" }).click();
  await expect(page).toHaveURL(/\/player-characters\/[0-9a-f-]+$/);
  return page.url().split("/").pop()!;
}

test("create, edit and restore a player character through Campaign", async ({ page }) => {
  const pool = testPool();
  try {
    const campaignId = await createCampaign(page);
    const region = page.getByRole("region", { name: "Player Characters" });
    await region.getByLabel("Character name").fill("Mira");
    await region.getByLabel("Player name (optional)").fill("Alex");
    await region.getByRole("button", { name: "Create character" }).click();
    await expect(page).toHaveURL(/\/player-characters\/[0-9a-f-]+$/);
    const characterId = page.url().split("/").pop()!;
    await expect(page.getByLabel("Player name (optional)")).toHaveValue("Alex");
    await page.getByLabel("Current state (optional)").fill("Exploring the harbor");
    await page.getByRole("button", { name: "Save character" }).click();
    await expect(page.getByLabel("Current state (optional)")).toHaveValue("Exploring the harbor");
    await page.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByText("Archived", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Trash" }).click();
    await expect(page.getByText("Restore returns this character to Archived.")).toBeVisible();
    await page.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByText("Archived", { exact: true })).toBeVisible();
    await page.goto(`/campaigns/${campaignId}`);
    await expect(page.getByRole("region", { name: "Player Characters" }).getByRole("link", { name: "Mira" })).toBeVisible();
    expect((await pool.query("SELECT player_name, current_state FROM player_character WHERE id = $1", [characterId])).rows[0])
      .toEqual({ player_name: "Alex", current_state: "Exploring the harbor" });
  } finally { await pool.end(); }
});

test("party membership changes preserve player characters and survive lifecycle", async ({ page }) => {
  const pool = testPool();
  try {
    const campaignId = await createCampaign(page);
    const miraId = await createCharacter(page, campaignId, "Mira");
    const teoId = await createCharacter(page, campaignId, "Teo");
    await page.goto(`/campaigns/${campaignId}`);
    const region = page.getByRole("region", { name: "Parties" });
    await region.getByLabel("Name", { exact: true }).fill("The Lanterns");
    await region.getByLabel("Mira").check();
    await region.getByLabel("Teo").check();
    await region.getByRole("button", { name: "Create party" }).click();
    await expect(page).toHaveURL(/\/parties\/[0-9a-f-]+$/);
    const partyId = page.url().split("/").pop()!;
    await expect(page.getByText("2 members")).toBeVisible();
    await page.getByLabel("Teo").uncheck();
    await page.getByRole("button", { name: "Save party" }).click();
    await expect(page.getByText("1 member", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Archive" }).click();
    await page.getByRole("button", { name: "Trash" }).click();
    await page.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByText("Archived", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Mira")).toBeChecked();
    await expect(page.getByLabel("Teo")).not.toBeChecked();
    await page.goto(`/campaigns/${campaignId}`);
    await expect(page.getByRole("region", { name: "Parties" }).getByText("The Lanterns · 1 member · Mira")).toBeVisible();
    expect((await pool.query("SELECT player_character_id FROM party_member WHERE party_id = $1", [partyId])).rows)
      .toEqual([{ player_character_id: miraId }]);
    expect((await pool.query("SELECT id FROM player_character WHERE id IN ($1, $2) ORDER BY id", [miraId, teoId])).rows)
      .toHaveLength(2);
  } finally { await pool.end(); }
});

test("stale party edit cannot overwrite newer composition", async ({ page, context }) => {
  const pool = testPool();
  try {
    const campaignId = await createCampaign(page);
    const miraId = await createCharacter(page, campaignId, "Mira");
    await createCharacter(page, campaignId, "Teo");
    await page.goto(`/campaigns/${campaignId}`);
    const region = page.getByRole("region", { name: "Parties" });
    await region.getByLabel("Name", { exact: true }).fill("The Lanterns");
    await region.getByLabel("Mira").check();
    await region.getByRole("button", { name: "Create party" }).click();
    await expect(page).toHaveURL(/\/parties\/[0-9a-f-]+$/);
    const partyId = page.url().split("/").pop()!;
    const stale = await context.newPage();
    await stale.goto(page.url());
    await expect(stale.getByLabel("Mira")).toBeChecked();
    await page.getByLabel("Teo").check();
    await page.getByRole("button", { name: "Save party" }).click();
    await expect(page.getByText("2 members")).toBeVisible();
    await stale.getByLabel("Mira").uncheck();
    await stale.getByRole("button", { name: "Save party" }).click();
    await expect(stale.getByRole("main").getByRole("alert"))
      .toHaveText("This party changed since you opened it. Reload before saving again.");
    await expect(stale.getByRole("button", { name: "Save party" })).toBeDisabled();
    await stale.getByRole("button", { name: "Reload party" }).click();
    await expect(stale.getByLabel("Mira")).toBeChecked();
    await expect(stale.getByLabel("Teo")).toBeChecked();
    expect((await pool.query("SELECT player_character_id FROM party_member WHERE party_id = $1", [partyId])).rows)
      .toHaveLength(2);
    expect((await pool.query("SELECT player_character_id FROM party_member WHERE party_id = $1 AND player_character_id = $2", [partyId, miraId])).rowCount)
      .toBe(1);
    await stale.close();
  } finally { await pool.end(); }
});
