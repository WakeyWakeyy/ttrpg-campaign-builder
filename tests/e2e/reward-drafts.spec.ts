import { test, expect, type Page } from "@playwright/test";
import { testPool } from "./database";
import { planningCampaign, planningEditor as editor, recoverPlanning } from "./planning-draft-helpers";
async function openReward(page: Page) {
  const campaignId = await planningCampaign(page);
  const sessions = page.getByRole("region", { name: "Sessions" });
  await sessions.getByLabel("Title", { exact: true }).fill("Aftermath");
  await sessions.getByRole("button", { name: "Create session", exact: true }).click();
  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]+$/);
  const sessionId = page.url().split("/").pop()!;
  await page.goto(`/campaigns/${campaignId}`);
  await page.locator("#new-reward-title").fill("Crossing reward");
  await page.getByRole("button", { name: "Plan reward", exact: true }).click();
  await expect(page).toHaveURL(/\/rewards\/[0-9a-f-]+$/);
  const id = page.url().split("/").pop()!;
  const add = editor(page, "#new-component-description");
  await add.getByLabel("Description", { exact: true }).fill("Accepted component");
  await add.getByRole("button", { name: "Add component", exact: true }).click();
  await expect(add.locator('input[name="expectedRevision"]')).toHaveValue("2");
  return { id, sessionId };
}
test("Reward plan, components, selects and grant checkboxes stay independent until explicit saves", async ({ page }) => {
  const pool = testPool();
  try {
    const { id, sessionId } = await openReward(page);
    const main = editor(page, "#reward-title"), component = editor(page, '[id^="component-description-"]');
    const add = editor(page, "#new-component-description"), grant = editor(page, "#grant-recipient");
    await main.getByLabel("Planning notes").fill("Pending plan idea");
    await add.getByLabel("Kind", { exact: true }).selectOption("FAVOR");
    await add.getByLabel("Description", { exact: true }).fill("   ");
    await add.getByRole("button", { name: "Add component", exact: true }).click();
    await expect(add.getByRole("alert")).toBeVisible();
    await expect(add.getByLabel("Kind", { exact: true })).toHaveValue("FAVOR");
    await expect(add.getByLabel("Description", { exact: true })).toHaveValue("   ");
    await add.getByLabel("Description", { exact: true }).fill("Pending new favor");
    await grant.getByRole("checkbox").check();
    await grant.getByLabel("Given to").fill("Local recipient");
    await grant.getByLabel("Session (optional)").selectOption(sessionId);
    await grant.getByLabel("What happened (optional)").fill("Local outcome");
    const key = await grant.locator('input[name="requestKey"]').inputValue();
    await component.getByLabel("Kind", { exact: true }).selectOption("ITEM");
    await component.getByLabel("Description", { exact: true }).fill("Accepted item");
    await component.getByRole("button", { name: "Save component", exact: true }).click();
    await expect(component.locator('input[name="expectedRevision"]')).toHaveValue("3");
    await expect(main.getByLabel("Planning notes")).toHaveValue("Pending plan idea");
    await expect(main.locator('input[name="expectedRevision"]')).toHaveValue("2");
    await expect(add.getByLabel("Kind", { exact: true })).toHaveValue("FAVOR");
    await expect(add.getByLabel("Description", { exact: true })).toHaveValue("Pending new favor");
    await expect(grant.getByRole("checkbox")).toBeChecked();
    await expect(grant.getByLabel("Session (optional)")).toHaveValue(sessionId);
    await expect(grant.getByLabel("Given to")).toHaveValue("Local recipient");
    await expect(grant.getByLabel("What happened (optional)")).toHaveValue("Local outcome");
    await expect(grant.locator('input[name="expectedRevision"]')).toHaveValue("2");
    await expect(grant.locator('input[name="requestKey"]')).toHaveValue(key);
    await component.getByLabel("Kind", { exact: true }).selectOption("INFORMATION");
    await component.getByLabel("Description", { exact: true }).fill("Unsaved next component");
    await recoverPlanning(main, 3);
    await main.getByRole("button", { name: "Save reward", exact: true }).click();
    await expect(main.locator('input[name="expectedRevision"]')).toHaveValue("4");
    await expect(component.getByLabel("Kind", { exact: true })).toHaveValue("INFORMATION");
    await expect(component.getByLabel("Description", { exact: true })).toHaveValue("Unsaved next component");
    await expect(component.locator('input[name="expectedRevision"]')).toHaveValue("3");
    await recoverPlanning(grant, 4);
    await expect(grant.locator('input[name="requestKey"]')).toHaveValue(key);
    await grant.getByRole("checkbox").uncheck();
    await grant.getByRole("button", { name: "Record grant", exact: true }).click();
    await expect(grant.getByRole("alert")).toContainText("Choose available components");
    await expect(grant.getByLabel("Given to")).toHaveValue("Local recipient");
    await expect(grant.getByLabel("What happened (optional)")).toHaveValue("Local outcome");
    await expect(grant.getByLabel("Session (optional)")).toHaveValue(sessionId);
    await expect(grant.locator('input[name="requestKey"]')).toHaveValue(key);
    expect((await pool.query("SELECT count(*)::int AS count FROM reward_grant WHERE reward_id=$1", [id])).rows[0].count).toBe(0);
    await grant.getByRole("checkbox").check();
    await grant.getByRole("button", { name: "Record grant", exact: true }).click();
    await expect(grant.getByRole("status").filter({ hasText: /^Grant recorded\./ })).toBeVisible();
    await expect(grant.locator('input[name="expectedRevision"]')).toHaveValue("5");
    await expect(grant.getByLabel("Given to")).toHaveValue(""); await expect(grant.getByRole("checkbox")).not.toBeChecked();
    await expect(grant.locator('input[name="requestKey"]')).not.toHaveValue(key);
    await expect(component.getByLabel("Description", { exact: true })).toHaveValue("Unsaved next component");
    await expect(add.getByLabel("Description", { exact: true })).toHaveValue("Pending new favor");
    expect((await pool.query("SELECT kind, description FROM reward_grant_component JOIN reward_grant ON reward_grant.id=grant_id WHERE reward_id=$1", [id])).rows)
      .toEqual([{ kind: "ITEM", description: "Accepted item" }]);
  } finally { await pool.end(); }
});

test("Reward stale plan and component recover without accepting newer fields implicitly", async ({ page, context }) => {
  const pool = testPool(), other = await context.newPage();
  try {
    const { id } = await openReward(page);
    await other.goto(page.url());
    const main = editor(page, "#reward-title"), component = editor(page, '[id^="component-description-"]');
    await main.getByLabel("Title", { exact: true }).fill("   "); await main.getByLabel("Planning notes").fill("Local plan");
    await main.getByRole("button", { name: "Save reward", exact: true }).click();
    await expect(main.getByRole("alert")).toBeVisible(); await expect(main.getByLabel("Planning notes")).toHaveValue("Local plan");
    await main.getByLabel("Title", { exact: true }).fill("Local title");
    await component.getByLabel("Kind", { exact: true }).selectOption("FAVOR");
    await component.getByLabel("Description", { exact: true }).fill("Pending favor");
    await other.locator("#reward-title").fill("Remote title");
    await other.getByRole("button", { name: "Save reward", exact: true }).click();
    await expect(editor(other, "#reward-title").locator('input[name="expectedRevision"]')).toHaveValue("3");
    await main.getByRole("button", { name: "Save reward", exact: true }).click();
    await expect(main.getByRole("alert")).toContainText("draft is retained");
    await expect(main.getByLabel("Title", { exact: true })).toHaveValue("Local title");
    await expect(component.getByLabel("Kind", { exact: true })).toHaveValue("FAVOR");
    await component.getByRole("button", { name: "Save component", exact: true }).click();
    await expect(component.getByRole("alert")).toContainText("draft is retained");
    await expect(component.getByLabel("Description", { exact: true })).toHaveValue("Pending favor");
    await recoverPlanning(component, 3);
    await other.locator("#reward-notes").fill("Another remote update");
    await other.getByRole("button", { name: "Save reward", exact: true }).click();
    await expect(editor(other, "#reward-title").locator('input[name="expectedRevision"]')).toHaveValue("4");
    await component.getByRole("button", { name: "Save component", exact: true }).click();
    await expect(component.getByRole("alert")).toContainText("draft is retained");
    await recoverPlanning(component, 4);
    await component.getByRole("button", { name: "Save component", exact: true }).click();
    await expect(component.locator('input[name="expectedRevision"]')).toHaveValue("5");
    expect((await pool.query("SELECT title, notes FROM reward WHERE id=$1", [id])).rows[0]).toEqual({ title: "Remote title", notes: "Another remote update" });
    await main.getByRole("button", { name: "View persisted values for this section", exact: true }).click();
    await main.getByRole("button", { name: "Load persisted values (discard this draft)", exact: true }).click();
    await expect(main.getByLabel("Title", { exact: true })).toHaveValue("Remote title");
  } finally { await other.close(); await pool.end(); }
});

test("removing a selected component never silently turns a pending grant into a smaller grant", async ({ page }) => {
  const pool = testPool();
  try {
    const { id } = await openReward(page), add = editor(page, "#new-component-description");
    await add.getByLabel("Description", { exact: true }).fill("Second component");
    await add.getByRole("button", { name: "Add component", exact: true }).click();
    await expect(add.locator('input[name="expectedRevision"]')).toHaveValue("3");
    const grant = editor(page, "#grant-recipient");
    await grant.getByRole("checkbox").nth(0).check(); await grant.getByRole("checkbox").nth(1).check();
    await grant.getByLabel("Given to").fill("Party"); await grant.getByLabel("What happened (optional)").fill("Retained outcome");
    const key = await grant.locator('input[name="requestKey"]').inputValue();
    const first = page.locator("form").filter({ has: page.locator('[id^="component-description-"]') }).nth(0).locator("..");
    await first.getByRole("button", { name: "Remove component", exact: true }).click();
    await expect(first.locator('input[name="expectedRevision"]')).toHaveValue("4");
    await expect(grant.getByRole("checkbox").nth(0)).toBeChecked(); await expect(grant.getByRole("checkbox").nth(1)).toBeChecked();
    await expect(grant.locator('input[name="expectedRevision"]')).toHaveValue("3");
    await recoverPlanning(grant, 4);
    await grant.getByRole("button", { name: "Record grant", exact: true }).click();
    await expect(grant.getByRole("alert")).toContainText("Choose available components");
    await expect(grant.getByLabel("What happened (optional)")).toHaveValue("Retained outcome");
    await expect(grant.getByRole("checkbox").nth(0)).toBeChecked();
    await expect(grant.locator('input[name="requestKey"]')).toHaveValue(key);
    expect((await pool.query("SELECT count(*)::int AS count FROM reward_grant WHERE reward_id=$1", [id])).rows[0].count).toBe(0);
    await grant.getByRole("checkbox").nth(0).uncheck();
    await grant.getByRole("button", { name: "Record grant", exact: true }).click();
    await expect(grant.locator('input[name="expectedRevision"]')).toHaveValue("5");
    expect((await pool.query("SELECT count(*)::int AS count FROM reward_grant_component JOIN reward_grant ON reward_grant.id=grant_id WHERE reward_id=$1", [id])).rows[0].count).toBe(1);
  } finally { await pool.end(); }
});

test("a lost grant response retries the identical key and payload without duplicating the ledger", async ({ page }) => {
  const pool = testPool();
  try {
    const { id } = await openReward(page), grant = editor(page, "#grant-recipient");
    await grant.getByRole("checkbox").check(); await grant.getByLabel("Given to").fill("Party");
    await grant.getByLabel("What happened (optional)").fill("Ambiguous grant outcome");
    const key = await grant.locator('input[name="requestKey"]').inputValue();
    let dropped = false;
    await page.route(`**/rewards/${id}`, async route => {
      if (!dropped && route.request().method() === "POST" && route.request().postData()?.includes("Ambiguous grant outcome")) {
        dropped = true;
        await route.fetch(); // The transaction commits, but the browser never receives its response.
        await route.abort("failed");
      } else await route.continue();
    });
    await grant.getByRole("button", { name: "Record grant", exact: true }).click();
    await expect(grant.getByRole("alert")).toContainText("Unable to confirm");
    await expect(grant.getByLabel("Given to")).toHaveValue("Party");
    await expect(grant.getByLabel("Given to")).toBeDisabled();
    await expect(grant.locator('input[name="requestKey"]')).toHaveValue(key);
    expect((await pool.query("SELECT count(*)::int AS count FROM reward_grant WHERE reward_id=$1 AND request_key=$2", [id, key])).rows[0].count).toBe(1);
    await grant.getByRole("button", { name: "View persisted values for this section", exact: true }).click();
    await expect(grant.getByRole("button", { name: "Keep this draft and use this revision", exact: true })).toBeDisabled();
    await grant.getByRole("button", { name: "Retry the same grant request", exact: true }).click();
    await expect(grant.getByRole("status").filter({ hasText: /^Grant recorded\./ })).toBeVisible();
    await expect(grant.locator('input[name="expectedRevision"]')).toHaveValue("3");
    await expect(grant.locator('input[name="requestKey"]')).not.toHaveValue(key);
    const persisted = (await pool.query("SELECT recipient, notes FROM reward_grant WHERE reward_id=$1", [id])).rows;
    expect(persisted).toEqual([{ recipient: "Party", notes: "Ambiguous grant outcome" }]);
  } finally { await pool.end(); }
});
