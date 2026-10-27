import { test, expect, type Page } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { testPool } from "./database";

function editor(page: Page, selector: string) {
  return page.locator("form").filter({ has: page.locator(selector) }).locator("..");
}
async function openSession(page: Page) {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_EMAIL! });
  await page.goto("/");
  const campaign = page.getByRole("region", { name: "Create campaign" });
  await campaign.getByLabel("Name", { exact: true }).fill("Session drafts");
  await campaign.getByLabel("Original premise").fill("Preserve independent ideas.");
  await campaign.getByRole("button", { name: "Create campaign", exact: true }).click();
  await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]+$/);
  const sessions = page.getByRole("region", { name: "Sessions" });
  await sessions.getByLabel("Title", { exact: true }).fill("Crossing");
  await sessions.getByLabel("Preparation").fill("Session plan");
  await sessions.getByRole("button", { name: "Create session", exact: true }).click();
  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]+$/);
  const id = page.url().split("/").pop()!;
  const add = editor(page, "#new-scene-title");
  await add.getByLabel("Title", { exact: true }).fill("Gate");
  await add.getByLabel("Preparation", { exact: true }).fill("Scene plan");
  await add.getByRole("button", { name: "Add scene", exact: true }).click();
  await expect(add.getByRole("status").filter({ hasText: /^Scene created\./ })).toHaveText("Scene created. Other sections were not saved.");
  await expect(add.locator('input[name="expectedRevision"]')).toHaveValue("2");
  await expect(add.getByLabel("Title", { exact: true })).toHaveValue("");
  return id;
}
async function recover(section: ReturnType<typeof editor>, revision: number) {
  await section.getByRole("button", { name: "View persisted values for this section", exact: true }).click();
  await expect(section.getByRole("heading", { name: `Persisted section · revision ${revision}` })).toBeVisible();
  await section.getByRole("button", { name: "Keep this draft and use this revision", exact: true }).click();
  await expect(section.locator('input[name="expectedRevision"]')).toHaveValue(String(revision));
}

test("Session and Scene keep independent drafts across accepted sibling saves and explicit recovery", async ({ page }) => {
  const pool = testPool();
  try {
    const id = await openSession(page);
    const session = editor(page, "#session-title");
    const scene = editor(page, '[id^="scene-title-"]');
    const add = editor(page, "#new-scene-title");
    await session.getByLabel("Title", { exact: true }).fill("Local session title");
    await session.getByLabel("Planned date (optional)").fill("2026-11-01");
    await session.getByLabel("Preparation", { exact: true }).fill("UNSAVED SESSION IDEA");
    await session.getByLabel("What actually happened (optional)").fill("Pending session result");
    await add.getByLabel("Title", { exact: true }).fill("Pending new scene");
    await scene.getByLabel("Preparation", { exact: true }).fill("Saved scene plan");
    await scene.getByRole("button", { name: "Save scene", exact: true }).click();
    // Wait for confirmed response AND fresh form revision, not a value sampled before revalidation.
    await expect(scene.getByRole("status").filter({ hasText: /^Scene saved\./ })).toHaveText("Scene saved. Other sections were not saved.");
    await expect(scene.locator('input[name="expectedRevision"]')).toHaveValue("3");
    await expect(session.getByLabel("Title", { exact: true })).toHaveValue("Local session title");
    await expect(session.getByLabel("Planned date (optional)")).toHaveValue("2026-11-01");
    await expect(session.getByLabel("Preparation", { exact: true })).toHaveValue("UNSAVED SESSION IDEA");
    await expect(session.getByLabel("What actually happened (optional)")).toHaveValue("Pending session result");
    await expect(session.locator('input[name="expectedRevision"]')).toHaveValue("2");
    await expect(session.getByRole("button", { name: "Save session", exact: true })).toBeDisabled();
    await expect(add.getByLabel("Title", { exact: true })).toHaveValue("Pending new scene");
    expect((await pool.query("SELECT title, preparation, outcome FROM session WHERE id = $1", [id])).rows[0])
      .toEqual({ title: "Crossing", preparation: "Session plan", outcome: null });
    await scene.getByLabel("What happened", { exact: true }).fill("Pending scene result");
    await recover(session, 3);
    await expect(session.getByLabel("Preparation", { exact: true })).toHaveValue("UNSAVED SESSION IDEA");
    expect((await pool.query("SELECT revision FROM campaign_entity WHERE id = $1", [id])).rows[0].revision).toBe(3);
    await session.getByRole("button", { name: "Save session", exact: true }).click();
    await expect(session.getByRole("status").filter({ hasText: /^Session saved\./ })).toHaveText("Session saved. Other sections were not saved.");
    await expect(session.locator('input[name="expectedRevision"]')).toHaveValue("4");
    await expect(scene.getByLabel("What happened", { exact: true })).toHaveValue("Pending scene result");
    await expect(scene.locator('input[name="expectedRevision"]')).toHaveValue("3");
    await expect(scene.getByRole("button", { name: "Save scene", exact: true })).toBeDisabled();
    await recover(scene, 4);
    await scene.getByRole("button", { name: "Save scene", exact: true }).click();
    await expect(scene.locator('input[name="expectedRevision"]')).toHaveValue("5");
    expect((await pool.query("SELECT preparation, outcome FROM session WHERE id = $1", [id])).rows[0])
      .toEqual({ preparation: "UNSAVED SESSION IDEA", outcome: "Pending session result" });
    expect((await pool.query("SELECT preparation, outcome FROM scene WHERE session_id = $1", [id])).rows[0])
      .toEqual({ preparation: "Saved scene plan", outcome: "Pending scene result" });
    await expect(add.getByLabel("Title", { exact: true })).toHaveValue("Pending new scene");
  } finally { await pool.end(); }
});

test("Recap preserves both outcomes, rejects a new race after recovery, and keeps preparation separate", async ({ page, context }) => {
  const pool = testPool();
  const other = await context.newPage();
  try {
    const id = await openSession(page);
    await page.goto(`/sessions/${id}/recap`);
    const session = editor(page, "#session-recap");
    const scene = editor(page, '[id^="scene-recap-"]');
    await session.getByLabel("What actually happened?").fill("UNSAVED SESSION OUTCOME");
    await scene.getByLabel("What happened in this scene?").fill("Accepted scene outcome");
    await scene.getByRole("button", { name: "Save scene outcome", exact: true }).click();
    await expect(scene.getByRole("status").filter({ hasText: /^Scene outcome saved\./ })).toHaveText("Scene outcome saved. Other sections were not saved.");
    await expect(scene.locator('input[name="expectedRevision"]')).toHaveValue("3");
    await expect(session.getByLabel("What actually happened?")).toHaveValue("UNSAVED SESSION OUTCOME");
    await expect(session.locator('input[name="expectedRevision"]')).toHaveValue("2");
    await scene.getByLabel("What happened in this scene?").fill("SECOND SCENE DRAFT");
    await recover(session, 3);
    await session.getByRole("button", { name: "Save session outcome", exact: true }).click();
    await expect(session.locator('input[name="expectedRevision"]')).toHaveValue("4");
    await expect(scene.getByLabel("What happened in this scene?")).toHaveValue("SECOND SCENE DRAFT");
    await recover(scene, 4);
    await other.goto(`/sessions/${id}/recap`);
    await other.getByLabel("What actually happened?").fill("Newer remote session outcome");
    await other.getByRole("button", { name: "Save session outcome", exact: true }).click();
    await expect(editor(other, "#session-recap").locator('input[name="expectedRevision"]')).toHaveValue("5");
    await scene.getByRole("button", { name: "Save scene outcome", exact: true }).click();
    await expect(scene.getByRole("alert")).toContainText("This draft is retained");
    await expect(scene.getByLabel("What happened in this scene?")).toHaveValue("SECOND SCENE DRAFT");
    expect((await pool.query("SELECT outcome FROM scene WHERE session_id = $1", [id])).rows[0].outcome).toBe("Accepted scene outcome");
    await recover(scene, 5);
    await scene.getByRole("button", { name: "Save scene outcome", exact: true }).click();
    await expect(scene.locator('input[name="expectedRevision"]')).toHaveValue("6");
    expect((await pool.query("SELECT preparation, outcome FROM session WHERE id = $1", [id])).rows[0])
      .toEqual({ preparation: "Session plan", outcome: "Newer remote session outcome" });
    expect((await pool.query("SELECT preparation, outcome FROM scene WHERE session_id = $1", [id])).rows[0])
      .toEqual({ preparation: "Scene plan", outcome: "SECOND SCENE DRAFT" });
  } finally { await other.close(); await pool.end(); }
});

test("validation and remote refresh preserve the entire local section, including untouched fields", async ({ page, context }) => {
  const other = await context.newPage();
  try {
    const id = await openSession(page);
    const session = editor(page, "#session-title");
    const scene = editor(page, '[id^="scene-title-"]');
    await session.getByLabel("Title", { exact: true }).fill("   ");
    await session.getByLabel("Preparation", { exact: true }).fill("Validation draft");
    await session.getByRole("button", { name: "Save session", exact: true }).click();
    await expect(session.getByRole("alert")).toContainText("Check the session details");
    await expect(session.getByLabel("Title", { exact: true })).toHaveValue("   ");
    await expect(session.getByLabel("Preparation", { exact: true })).toHaveValue("Validation draft");
    await session.getByLabel("Title", { exact: true }).fill("Crossing");
    await other.goto(`/sessions/${id}`);
    await other.locator("#session-title").fill("Remote title");
    await other.locator("#session-date").fill("2026-12-01");
    await other.getByRole("button", { name: "Save session", exact: true }).click();
    await expect(editor(other, "#session-title").locator('input[name="expectedRevision"]')).toHaveValue("3");
    await scene.getByLabel("Preparation", { exact: true }).fill("Local scene change");
    await scene.getByRole("button", { name: "Save scene", exact: true }).click();
    await expect(scene.getByRole("alert")).toContainText("This draft is retained");
    await recover(scene, 3);
    await scene.getByRole("button", { name: "Save scene", exact: true }).click();
    await expect(scene.locator('input[name="expectedRevision"]')).toHaveValue("4");
    await expect(page.getByRole("heading", { name: "Remote title", exact: true })).toBeVisible();
    await expect(session.getByLabel("Title", { exact: true })).toHaveValue("Crossing");
    await expect(session.getByLabel("Planned date (optional)")).toHaveValue("");
    await expect(session.getByLabel("Preparation", { exact: true })).toHaveValue("Validation draft");
    await expect(session.locator('input[name="expectedRevision"]')).toHaveValue("2");
  } finally { await other.close(); }
});

test("a scene moved to trash stays copyable in Recap without allowing draft reapplication", async ({ page, context }) => {
  const other = await context.newPage();
  try {
    const id = await openSession(page);
    await page.goto(`/sessions/${id}/recap`);
    const session = editor(page, "#session-recap");
    const scene = editor(page, '[id^="scene-recap-"]');
    await scene.getByLabel("What happened in this scene?").fill("Keep this unavailable scene draft");
    await other.goto(`/sessions/${id}`);
    await other.getByRole("button", { name: "Trash scene", exact: true }).click();
    await expect(editor(other, '[id^="scene-title-"]').locator('input[name="expectedRevision"]')).toHaveValue("3");
    await session.getByLabel("What actually happened?").fill("Session result");
    await session.getByRole("button", { name: "Save session outcome", exact: true }).click();
    await expect(session.getByRole("alert")).toContainText("This draft is retained");
    await recover(session, 3);
    await session.getByRole("button", { name: "Save session outcome", exact: true }).click();
    await expect(session.locator('input[name="expectedRevision"]')).toHaveValue("4");
    await expect(scene.getByLabel("What happened in this scene?")).toHaveValue("Keep this unavailable scene draft");
    await expect(scene.getByLabel("What happened in this scene?")).not.toBeEditable();
    await scene.getByRole("button", { name: "View persisted values for this section", exact: true }).click();
    await expect(scene.getByRole("button", { name: "Keep this draft and use this revision", exact: true })).toBeDisabled();
    await expect(scene.getByRole("region", { name: "Persisted section values" })).toContainText("This section is in trash");
    await expect(scene.getByLabel("What happened in this scene?")).toHaveValue("Keep this unavailable scene draft");
  } finally { await other.close(); }
});
