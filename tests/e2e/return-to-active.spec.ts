import { test, expect, type Page } from "@playwright/test";
import { planningCampaign, planningEditor as editor, recoverPlanning } from "./planning-draft-helpers";
import { testPool } from "./database";

const cases = [
  { kind: "Location", table: "location", area: "Locations", create: "Create location", title: "#name", notes: "#description" },
  { kind: "Session", table: "session", area: "Sessions", create: "Create session", title: "#session-title", notes: "#session-preparation" },
  { kind: "Encounter", table: "encounter", area: "Encounters", create: "Create encounter", title: "#encounter-title", notes: "#encounter-notes" },
  { kind: "Reward", table: "reward", area: "Rewards", create: "Plan reward", title: "#reward-title", notes: "#reward-notes" },
] as const;
async function open(page: Page, item: typeof cases[number]) {
  await planningCampaign(page);
  const area = page.getByRole("region", { name: item.area });
  await area.getByLabel(item.kind === "Location" ? "Name" : "Title", { exact: true }).fill(`Lifecycle ${item.kind}`);
  if (item.kind === "Location") await area.getByLabel("Description (optional)").fill("Persisted text");
  if (item.kind === "Session") await area.getByLabel("Preparation").fill("Persisted text");
  await area.getByRole("button", { name: item.create, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${item.table}s/[0-9a-f-]+$`));
  const id = page.url().split("/").pop()!;
  if (item.kind === "Session") {
    const add = editor(page, "#new-scene-title");
    await add.getByLabel("Title", { exact: true }).fill("Child scene");
    await add.getByLabel("Preparation", { exact: true }).fill("Persisted child");
    await add.getByRole("button", { name: "Add scene", exact: true }).click();
    await expect(add.locator('input[name="expectedRevision"]')).toHaveValue("2");
  }
  if (item.kind === "Encounter") {
    const add = editor(page, "#new-creature-name");
    await add.getByLabel("Name", { exact: true }).fill("Guard");
    await add.getByLabel("XP per creature", { exact: true }).fill("100");
    await add.getByRole("button", { name: "Add creature", exact: true }).click();
    await expect(add.locator('input[name="expectedRevision"]')).toHaveValue("2");
  }
  if (item.kind === "Reward") {
    const add = editor(page, "#new-component-description");
    await add.getByLabel("Description", { exact: true }).fill("Persisted component");
    await add.getByRole("button", { name: "Add component", exact: true }).click();
    await expect(add.locator('input[name="expectedRevision"]')).toHaveValue("2");
  }
  return id;
}
for (const item of cases) {
  test(`${item.kind}: explicit return to Active preserves content, local drafts and related base revisions`, async ({ page }) => {
    const pool = testPool();
    try {
      const id = await open(page, item), main = editor(page, item.title);
      const entity = async () => (await pool.query("SELECT * FROM campaign_entity WHERE id=$1", [id])).rows[0];
      const typed = async () => (await pool.query(`SELECT to_jsonb(t) AS data FROM ${item.table} t WHERE id=$1`, [id])).rows[0];
      const original = await typed();
      let revision = (await entity()).revision;
      const active = main.getByRole("button", { name: "Return to active", exact: true });
      await expect(active).toHaveCount(0);
      async function status(button: string) {
        await main.getByRole("button", { name: button, exact: true }).click();
        revision++;
        await expect(main.locator('input[name="expectedRevision"]')).toHaveValue(String(revision));
        expect((await entity()).revision).toBe(revision);
      }
      await status("Archive");
      await expect(active).toBeEnabled();
      await expect(active).toHaveAttribute("formnovalidate", "");
      await status("Trash");
      await expect(active).toHaveCount(0);
      await expect(page.locator(item.notes)).not.toBeEditable();
      await status("Restore");
      expect((await entity()).archived_at).not.toBeNull();
      await expect(active).toBeEnabled();
      await status("Return to active");
      expect(await entity()).toMatchObject({ archived_at: null, deleted_at: null, purge_after: null });
      await expect(active).toHaveCount(0);
      expect(await typed()).toEqual(original);

      const base = revision;
      const childSelector = item.kind === "Session" ? '[id^="scene-title-"]' : item.kind === "Encounter" ? '[id^="creature-name-"]' : '[id^="component-description-"]';
      const child = item.kind === "Location" ? null : editor(page, childSelector);
      if (child) await child.getByLabel(item.kind === "Session" ? "Preparation" : item.kind === "Encounter" ? "Name" : "Description", { exact: true }).fill("UNSAVED CHILD");
      await page.locator(item.title).fill("");
      await page.locator(item.notes).fill("UNSAVED LOCAL TEXT");
      await main.getByRole("button", { name: "Archive", exact: true }).click();
      revision++;
      await expect(active).toBeVisible();
      expect((await entity()).revision).toBe(revision);
      if (item.kind !== "Location") await recoverPlanning(main, revision);
      await active.click();
      revision++;
      await expect(main.getByRole("button", { name: "Archive", exact: true })).toBeVisible();
      await expect(main.getByRole("status").filter({ hasText: "status updated." })).toContainText(item.kind === "Location" ? "Name and description were not saved" : "Draft text was not saved");
      expect(await entity()).toMatchObject({ revision, archived_at: null });
      await expect(page.locator(item.title)).toHaveValue("");
      await expect(page.locator(item.notes)).toHaveValue("UNSAVED LOCAL TEXT");
      expect(await typed()).toEqual(original);
      if (child) {
        await expect(child.locator('input[name="expectedRevision"]')).toHaveValue(String(base));
        await expect(child.getByLabel(item.kind === "Session" ? "Preparation" : item.kind === "Encounter" ? "Name" : "Description", { exact: true })).toHaveValue("UNSAVED CHILD");
        await expect(child.getByRole("button", { name: item.kind === "Session" ? "Save scene" : item.kind === "Encounter" ? "Save creature" : "Save component", exact: true })).toBeDisabled();
      }
    } finally { await pool.end(); }
  });
}
