import { test, expect, type Page } from "@playwright/test";
import { planningCampaign, planningEditor as editor } from "./planning-draft-helpers";
import { testPool } from "./database";

async function location(page: Page) {
  const campaignId = await planningCampaign(page);
  const area = page.getByRole("region", { name: "Locations" });
  await area.getByLabel("Name", { exact: true }).fill("Navigation harbor");
  await area.getByLabel("Description (optional)").fill("Original description");
  await area.getByRole("button", { name: "Create location", exact: true }).click();
  await expect(page).toHaveURL(/\/locations\/[0-9a-f-]+$/);
  return { campaignId, id: page.url().split("/").pop()! };
}

test("internal links preserve canceled drafts, reverted fields are clean, and history gets no artificial entries", async ({ page, context }) => {
  const pool = testPool();
  try {
    const { campaignId, id } = await location(page), url = page.url();
    const description = page.getByLabel("Description", { exact: true });
    let accept = false;
    const dialogs: string[] = [];
    page.on("dialog", async dialog => { dialogs.push(dialog.type()); if (accept) await dialog.accept(); else await dialog.dismiss(); });
    const historyLength = await page.evaluate(() => history.length);
    await description.fill("LOCAL NAVIGATION IDEA");
    await page.getByRole("link", { name: "Back to campaign", exact: true }).click();
    await expect(page).toHaveURL(url);
    await expect(description).toHaveValue("LOCAL NAVIGATION IDEA");
    await expect(page.locator('input[name="expectedRevision"]')).toHaveValue("1");
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    expect(dialogs).toEqual(["confirm"]);
    // Modified clicks open another tab without discarding this editor.
    const popupPromise = context.waitForEvent("page");
    await page.getByRole("link", { name: "Back to campaign", exact: true }).click({ modifiers: ["ControlOrMeta"] });
    const popup = await popupPromise;
    await expect(popup).toHaveURL(new RegExp(`/campaigns/${campaignId}$`));
    await popup.close();
    expect(dialogs).toHaveLength(1);
    await description.fill("Original description");
    await page.getByRole("link", { name: "Back to campaign", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/campaigns/${campaignId}$`));
    expect(dialogs).toHaveLength(1);
    await page.getByRole("link", { name: "Navigation harbor", exact: true }).click();
    await description.fill("DISCARD ON DEPARTURE");
    accept = true;
    const before = await page.evaluate(() => history.length);
    await page.getByRole("link", { name: "TTRPG Campaign Builder", exact: true }).click();
    await expect(page).toHaveURL("http://localhost:3100/");
    expect(await page.evaluate(() => history.length)).toBe(before + 1);
    await page.goBack();
    await expect(page).toHaveURL(url);
    await expect(description).toHaveValue("Original description");
    await page.goForward();
    await expect(page).toHaveURL("http://localhost:3100/");
    expect(dialogs).toEqual(["confirm", "confirm"]);
    expect((await pool.query("SELECT description, revision FROM location JOIN campaign_entity USING(id,campaign_id) WHERE id=$1", [id])).rows[0])
      .toEqual({ description: "Original description", revision: 1 });
  } finally { await pool.end(); }
});

test("beforeunload protects reload only while dirty and cancellation never writes", async ({ page }) => {
  const pool = testPool();
  try {
    const { id } = await location(page), field = page.getByLabel("Description", { exact: true });
    const dialogs: string[] = []; let accept = false;
    page.on("dialog", async dialog => { dialogs.push(dialog.type()); if (accept) await dialog.accept(); else await dialog.dismiss(); });
    await field.fill("KEEP THROUGH CANCELED RELOAD");
    // A canceled reload never commits a navigation; invoke the browser operation
    // directly rather than waiting for Playwright's navigation completion.
    await page.evaluate(() => window.location.reload());
    expect(dialogs).toEqual(["beforeunload"]);
    await expect(field).toHaveValue("KEEP THROUGH CANCELED RELOAD");
    expect((await pool.query("SELECT description FROM location WHERE id=$1", [id])).rows[0].description).toBe("Original description");
    accept = true;
    await page.reload();
    await expect(field).toBeEditable();
    await expect(field).toHaveValue("Original description");
    expect(dialogs).toEqual(["beforeunload", "beforeunload"]);
    await page.reload();
    await expect(field).toBeEditable();
    expect(dialogs).toHaveLength(2);
    await field.fill("KEEP THROUGH DOCUMENT EXIT");
    accept = false;
    const current = page.url();
    await page.evaluate(() => window.location.assign("/"));
    await expect(page).toHaveURL(current);
    await expect(field).toHaveValue("KEEP THROUGH DOCUMENT EXIT");
    expect(dialogs).toEqual(["beforeunload", "beforeunload", "beforeunload"]);
  } finally { await pool.end(); }
});

test("closing a dirty tab can be canceled without losing its text or writing", async ({ page, context }) => {
  const pool = testPool();
  const tab = await context.newPage();
  try {
    const { id } = await location(page);
    await tab.goto(page.url());
    const field = tab.getByLabel("Description", { exact: true });
    await field.fill("KEEP THIS TAB DRAFT");
    const prompt = tab.waitForEvent("dialog");
    await tab.close({ runBeforeUnload: true });
    const dialog = await prompt;
    expect(dialog.type()).toBe("beforeunload");
    await dialog.dismiss();
    expect(tab.isClosed()).toBe(false);
    await expect(field).toHaveValue("KEEP THIS TAB DRAFT");
    expect((await pool.query("SELECT description FROM location WHERE id=$1", [id])).rows[0].description).toBe("Original description");
    const nextPrompt = tab.waitForEvent("dialog"), closed = tab.waitForEvent("close");
    await tab.close({ runBeforeUnload: true });
    await (await nextPrompt).accept();
    await closed;
  } finally { if (!tab.isClosed()) await tab.close(); await pool.end(); }
});

test("opted-in Campaign forms ignore anchors and downloads, and creation checks other drafts before its command", async ({ page }) => {
  const pool = testPool();
  try {
    const id = await planningCampaign(page), premise = page.locator("#currentPremise");
    const initial = await premise.inputValue();
    let accept = false; const dialogs: string[] = [];
    page.on("dialog", async dialog => { dialogs.push(dialog.type()); if (accept) await dialog.accept(); else await dialog.dismiss(); });
    await premise.fill("Pending compass");
    await page.getByRole("navigation", { name: "Campaign sections" }).getByRole("link", { name: "Encounters", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/campaigns/${id}#encounters$`));
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download JSON", exact: true }).click();
    await download;
    expect(dialogs).toEqual([]);
    const area = page.getByRole("region", { name: "Locations" });
    await area.getByLabel("Name", { exact: true }).fill("Only after confirmation");
    await area.getByRole("button", { name: "Create location", exact: true }).click();
    expect(dialogs).toEqual(["confirm"]);
    expect((await pool.query("SELECT count(*)::int AS count FROM location WHERE campaign_id=$1", [id])).rows[0].count).toBe(0);
    await expect(premise).toHaveValue("Pending compass");
    await expect(area.getByLabel("Name", { exact: true })).toHaveValue("Only after confirmation");
    // Reverting only the compass leaves the submitted form free to save itself.
    await premise.fill(initial);
    accept = true;
    await area.getByRole("button", { name: "Create location", exact: true }).click();
    await expect(page).toHaveURL(/\/locations\/[0-9a-f-]+$/);
    expect(dialogs).toHaveLength(1);
    expect((await pool.query("SELECT count(*)::int AS count FROM location WHERE campaign_id=$1", [id])).rows[0].count).toBe(1);
  } finally { await pool.end(); }
});

test("a Scene save leaves Session protected, and reuse preparation is confirmed before writing", async ({ page }) => {
  const pool = testPool();
  try {
    const campaignId = await planningCampaign(page);
    const area = page.getByRole("region", { name: "Sessions" });
    await area.getByLabel("Title", { exact: true }).fill("Original session");
    await area.getByLabel("Preparation").fill("Persisted preparation");
    await area.getByRole("button", { name: "Create session", exact: true }).click();
    await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]+$/);
    const id = page.url().split("/").pop()!;
    const add = editor(page, "#new-scene-title");
    await add.getByLabel("Title", { exact: true }).fill("Original scene");
    await add.getByRole("button", { name: "Add scene", exact: true }).click();
    await expect(add.locator('input[name="expectedRevision"]')).toHaveValue("2");
    const session = editor(page, "#session-title"), scene = editor(page, '[id^="scene-title-"]');
    await session.getByLabel("Preparation", { exact: true }).fill("UNSAVED SESSION");
    await scene.getByLabel("Preparation", { exact: true }).fill("Accepted scene plan");
    await scene.getByRole("button", { name: "Save scene", exact: true }).click();
    await expect(scene.locator('input[name="expectedRevision"]')).toHaveValue("3");
    let accept = false; const dialogs: string[] = [];
    page.on("dialog", async dialog => { dialogs.push(dialog.message()); if (accept) await dialog.accept(); else await dialog.dismiss(); });
    await page.getByRole("link", { name: "Record what happened", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/sessions/${id}$`));
    await expect(session.locator('input[name="expectedRevision"]')).toHaveValue("2");
    await page.getByRole("button", { name: "Reuse preparation in a new session", exact: true }).click();
    expect(dialogs).toHaveLength(2);
    expect((await pool.query("SELECT count(*)::int AS count FROM session WHERE campaign_id=$1", [campaignId])).rows[0].count).toBe(1);
    await expect(session.getByLabel("Preparation", { exact: true })).toHaveValue("UNSAVED SESSION");
    accept = true;
    await page.getByRole("button", { name: "Reuse preparation in a new session", exact: true }).click();
    await expect(page).not.toHaveURL(new RegExp(`/sessions/${id}$`));
    await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]+$/);
    expect(dialogs).toHaveLength(3);
    expect((await pool.query("SELECT count(*)::int AS count FROM session WHERE campaign_id=$1", [campaignId])).rows[0].count).toBe(2);
    expect((await pool.query("SELECT preparation FROM session WHERE id=$1", [id])).rows[0].preparation).toBe("Persisted preparation");
  } finally { await pool.end(); }
});

test("Blueprint departure and materialization preserve pending decisions on cancel; accepting submits once", async ({ page }) => {
  const pool = testPool();
  try {
    await planningCampaign(page);
    await page.getByRole("link", { name: "TTRPG Campaign Builder", exact: true }).click();
    await page.getByText("Start a blueprint draft", { exact: true }).click();
    await page.locator("#draft-title").fill("Navigation review");
    await page.locator("#draft-premise").fill("Persisted choices only");
    await page.locator("#draft-locations").fill("Harbor\nVault");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page).toHaveURL(/\/blueprints\/[0-9a-f-]+$/);
    const id = page.url().split("/").pop()!;
    await page.getByRole("button", { name: "Start Blueprint Review", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/blueprints/${id}/review$`));
    const proposals = page.locator("form").filter({ has: page.locator('[id^="name-"]') });
    await proposals.nth(0).getByLabel("Decision").selectOption("ACCEPTED");
    await proposals.nth(0).getByRole("button", { name: "Save proposal", exact: true }).click();
    await expect(proposals.nth(0).locator('input[name="expectedRevision"]')).toHaveValue("3");
    const baseRevision = await proposals.nth(1).locator('input[name="expectedRevision"]').inputValue();
    await proposals.nth(1).getByLabel("Location name").fill("UNSAVED VAULT");
    await proposals.nth(1).getByLabel("Decision").selectOption("ACCEPTED");
    const key = await page.locator('input[name="idempotencyKey"]').inputValue();
    let submits = 0, accept = false; const dialogs: string[] = [];
    await page.route(`**/blueprints/${id}/review`, async route => {
      if (route.request().method() === "POST" && route.request().postData()?.includes(key)) submits++;
      await route.continue();
    });
    page.on("dialog", async dialog => { dialogs.push(dialog.type()); if (accept) await dialog.accept(); else await dialog.dismiss(); });
    await page.getByRole("link", { name: "Back to draft", exact: true }).click();
    await page.getByRole("button", { name: "Create Campaign from accepted proposals", exact: true }).click();
    expect(dialogs).toEqual(["confirm", "confirm"]);
    expect(submits).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS count FROM blueprint_materialization WHERE blueprint_id=$1", [id])).rows[0].count).toBe(0);
    await expect(proposals.nth(1).getByLabel("Location name")).toHaveValue("UNSAVED VAULT");
    await expect(proposals.nth(1).getByLabel("Decision")).toHaveValue("ACCEPTED");
    await expect(proposals.nth(1).locator('input[name="expectedRevision"]')).toHaveValue(baseRevision);
    accept = true;
    await page.getByRole("button", { name: "Create Campaign from accepted proposals", exact: true }).click();
    await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]+$/);
    expect(submits).toBe(1);
    expect(dialogs).toHaveLength(3);
    const campaignId = page.url().split("/").pop()!;
    expect((await pool.query("SELECT name FROM location WHERE campaign_id=$1", [campaignId])).rows).toEqual([{ name: "Harbor" }]);
    expect((await pool.query("SELECT name, decision FROM blueprint_proposal WHERE blueprint_id=$1 ORDER BY sort_order", [id])).rows)
      .toEqual([{ name: "Harbor", decision: "ACCEPTED" }, { name: "Vault", decision: "PENDING" }]);
    expect((await pool.query("SELECT count(*)::int AS count FROM command_execution WHERE command_kind='BLUEPRINT_MATERIALIZE' AND idempotency_key=$1", [key])).rows[0].count).toBe(1);
  } finally { await pool.end(); }
});
