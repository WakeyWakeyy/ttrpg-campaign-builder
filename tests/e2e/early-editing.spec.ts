import { test, expect, type Page } from "@playwright/test";
import { testPool } from "./database";
import { planningCampaign, planningEditor as editor, recoverPlanning } from "./planning-draft-helpers";

// Hold script delivery, not application time: SSR must already be safe while
// this gate is closed. Always release it, including when an assertion fails.
async function delayScripts(page: Page, url: string) {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/_next/static/chunks/**", async route => {
    await gate;
    if (!page.isClosed()) await route.continue();
  });
  await page.goto(url, { waitUntil: "commit" });
  return release;
}

async function createSession(page: Page) {
  await planningCampaign(page);
  const area = page.getByRole("region", { name: "Sessions" });
  await area.getByLabel("Title", { exact: true }).fill("Early session");
  await area.getByLabel("Preparation").fill("Original session preparation");
  await area.getByRole("button", { name: "Create session", exact: true }).click();
  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]+$/);
  const id = page.url().split("/").pop()!;
  const add = editor(page, "#new-scene-title");
  await add.getByLabel("Title", { exact: true }).fill("Early scene");
  await add.getByLabel("Preparation").fill("Original scene preparation");
  await add.getByRole("button", { name: "Add scene", exact: true }).click();
  await expect(add.locator('input[name="expectedRevision"]')).toHaveValue("2");
  return id;
}

test("Location SSR prevents early input; mounted native editing saves exact text and Trash stays read-only", async ({ page, context }) => {
  const pool = testPool();
  const early = await context.newPage();
  let release: (() => void) | undefined;
  try {
    await planningCampaign(page);
    const area = page.getByRole("region", { name: "Locations" });
    await area.getByLabel("Name", { exact: true }).fill("Harbor");
    await area.getByLabel("Description (optional)").fill("Original description");
    await area.getByRole("button", { name: "Create location", exact: true }).click();
    await expect(page).toHaveURL(/\/locations\/[0-9a-f-]+$/);
    const url = page.url(), id = url.split("/").pop()!;
    release = await delayScripts(early, url);
    const name = early.getByLabel("Name", { exact: true });
    const description = early.getByLabel("Description", { exact: true });
    await expect(description).toBeVisible();
    await expect(name).toBeDisabled();
    await expect(description).toBeDisabled();
    await expect(early.getByRole("button", { name: "Save location", exact: true })).toBeDisabled();
    await expect(early.getByRole("button", { name: "View persisted version" })).toBeDisabled();
    await expect(early.locator("form")).toHaveAttribute("aria-busy", "true");
    expect(await description.evaluate(node => { node.focus(); return document.activeElement === node; })).toBe(false);
    await early.keyboard.insertText("BLOCKED EARLY TEXT");
    await expect(description).toHaveValue("Original description");
    await expect(early.locator('input[name="expectedRevision"]')).toHaveValue("1");
    release();
    // No hydration/value/network waits: native actionability must be sufficient.
    await description.fill("Temporary selection");
    await description.press("ControlOrMeta+A");
    await early.keyboard.insertText("Exact local idea — ñ");
    await expect(description).toBeFocused();
    await name.fill("Exact harbor");
    await expect(description).toHaveValue("Exact local idea — ñ");
    await early.getByRole("button", { name: "Save location", exact: true }).click();
    await expect(early.locator('input[name="expectedRevision"]')).toHaveValue("2");
    expect((await pool.query("SELECT name, description FROM location WHERE id=$1", [id])).rows[0])
      .toEqual({ name: "Exact harbor", description: "Exact local idea — ñ" });
    await expect(description).toBeEditable();
    await expect(early.locator("form")).toHaveAttribute("aria-busy", "false");
    await early.getByRole("button", { name: "Trash", exact: true }).click();
    await expect(early.locator('input[name="expectedRevision"]')).toHaveValue("3");
    await expect(description).toHaveAttribute("readonly", "");
    await expect(description).not.toBeEditable();
    await expect(early.getByRole("button", { name: "Restore", exact: true })).toBeEnabled();
  } finally { release?.(); await early.close(); await pool.end(); }
});

test("Session and Scene mount independently, retain sibling drafts and keep editing after revision recovery", async ({ page, context }) => {
  const pool = testPool();
  const early = await context.newPage();
  let release: (() => void) | undefined;
  try {
    const id = await createSession(page);
    release = await delayScripts(early, `/sessions/${id}`);
    const session = editor(early, "#session-title"), scene = editor(early, '[id^="scene-title-"]');
    const preparation = session.getByLabel("Preparation", { exact: true });
    await expect(preparation).toBeVisible();
    for (const field of [preparation, session.getByLabel("Title", { exact: true }),
      scene.getByLabel("Preparation", { exact: true }), early.locator("#new-scene-title")]) await expect(field).toBeDisabled();
    await expect(session.getByRole("button", { name: "Save session", exact: true })).toBeDisabled();
    await expect(scene.getByRole("button", { name: "Save scene", exact: true })).toBeDisabled();
    release();
    await preparation.fill("Exact session preparation");
    await scene.getByLabel("Preparation", { exact: true }).fill("Exact scene preparation");
    await session.getByRole("button", { name: "Save session", exact: true }).click();
    await expect(session.locator('input[name="expectedRevision"]')).toHaveValue("3");
    await expect(scene.getByLabel("Preparation", { exact: true })).toHaveValue("Exact scene preparation");
    await expect(scene.getByLabel("Preparation", { exact: true })).toBeEditable();
    await expect(scene.getByRole("button", { name: "Save scene", exact: true })).toBeDisabled();
    await expect(scene.locator('input[name="expectedRevision"]')).toHaveValue("2");
    await recoverPlanning(scene, 3);
    await scene.getByRole("button", { name: "Save scene", exact: true }).click();
    await expect(scene.locator('input[name="expectedRevision"]')).toHaveValue("4");
    expect((await pool.query("SELECT preparation FROM session WHERE id=$1", [id])).rows[0].preparation).toBe("Exact session preparation");
    expect((await pool.query("SELECT preparation FROM scene WHERE session_id=$1", [id])).rows[0].preparation).toBe("Exact scene preparation");
    await preparation.fill("Normal editing after revision change");
    await expect(preparation).toHaveValue("Normal editing after revision change");
    await session.getByRole("button", { name: "Trash", exact: true }).click();
    await expect(session.getByRole("button", { name: "Restore", exact: true })).toBeVisible();
    await expect(preparation).toHaveAttribute("readonly", "");
    await expect(preparation).not.toBeEditable();
    await expect(scene.getByLabel("Preparation", { exact: true })).not.toBeEditable();
    await expect(preparation).toHaveValue("Normal editing after revision change");
  } finally { release?.(); await early.close(); await pool.end(); }
});

test("Recap blocks pre-hydration input and saves exact replacement outcomes without changing preparation", async ({ page, context }) => {
  const pool = testPool();
  const early = await context.newPage();
  let release: (() => void) | undefined;
  try {
    const id = await createSession(page);
    await page.goto(`/sessions/${id}/recap`);
    await page.getByLabel("What actually happened?").fill("Original session outcome");
    await page.getByRole("button", { name: "Save session outcome", exact: true }).click();
    await expect(editor(page, "#session-recap").locator('input[name="expectedRevision"]')).toHaveValue("3");
    await page.getByLabel("What happened in this scene?").fill("Original scene outcome");
    await page.getByRole("button", { name: "Save scene outcome", exact: true }).click();
    await expect(editor(page, '[id^="scene-recap-"]').locator('input[name="expectedRevision"]')).toHaveValue("4");
    release = await delayScripts(early, `/sessions/${id}/recap`);
    const session = editor(early, "#session-recap"), scene = editor(early, '[id^="scene-recap-"]');
    const outcome = session.getByLabel("What actually happened?");
    await expect(outcome).toBeVisible();
    await expect(outcome).toBeDisabled();
    await expect(scene.getByLabel("What happened in this scene?")).toBeDisabled();
    await expect(session.getByRole("button", { name: "Save session outcome", exact: true })).toBeDisabled();
    await expect(session.getByRole("button", { name: "View persisted values for this section" })).toBeDisabled();
    expect(await outcome.evaluate(node => { node.focus(); return document.activeElement === node; })).toBe(false);
    await early.keyboard.insertText("BLOCKED EARLY OUTCOME");
    await expect(outcome).toHaveValue("Original session outcome");
    release();
    await outcome.fill("Temporary selection");
    await outcome.press("ControlOrMeta+A");
    await early.keyboard.insertText("Exact session outcome — ñ");
    await expect(outcome).toBeFocused();
    await scene.getByLabel("What happened in this scene?").fill("Exact scene outcome");
    await session.getByRole("button", { name: "Save session outcome", exact: true }).click();
    await expect(session.locator('input[name="expectedRevision"]')).toHaveValue("5");
    await expect(scene.getByLabel("What happened in this scene?")).toHaveValue("Exact scene outcome");
    await recoverPlanning(scene, 5);
    await scene.getByRole("button", { name: "Save scene outcome", exact: true }).click();
    await expect(scene.locator('input[name="expectedRevision"]')).toHaveValue("6");
    expect((await pool.query("SELECT preparation, outcome FROM session WHERE id=$1", [id])).rows[0])
      .toEqual({ preparation: "Original session preparation", outcome: "Exact session outcome — ñ" });
    expect((await pool.query("SELECT preparation, outcome FROM scene WHERE session_id=$1", [id])).rows[0])
      .toEqual({ preparation: "Original scene preparation", outcome: "Exact scene outcome" });
    await expect(outcome).toBeEditable();
  } finally { release?.(); await early.close(); await pool.end(); }
});
