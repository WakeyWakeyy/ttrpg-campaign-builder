import { readFile } from "node:fs/promises";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

const campaign = "The Last Light of Brinewatch";
const premise = "Relight the harbor beacon before the spring tide strands the fishing fleet.";
const arc = "The Harbor Goes Dark";
const session = "A light before high tide";
const plan = "Ask Iona about the stolen lens, then reach the lantern room at low tide.";
const scene = "At the lantern room";
const scenePlan = "Offer the smugglers a way out before anyone draws a blade.";
const encounter = "Smugglers at the beacon";
const encounterOutcome = "The lookout surrendered and the second bandit fled.";
const sessionOutcome = "The beacon was relit and the fishing fleet returned safely.";
const sceneOutcome = "Iona seated the recovered lens just before high tide.";
const reward = "The Tidekeepers' thanks";
const component = "A harbor pass and safe berth through winter.";

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`Demo Alpha golden path at ${viewport.width}px`, async ({ page }, info) => {
    test.setTimeout(240_000);
    await page.setViewportSize(viewport);

    async function checkWidth() {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    }

    async function capture(name: string) {
      await checkWidth();
      // Exclude the authenticated account header and local development toolbar.
      const inset = await page.getByRole("main").evaluate(node => Math.max(0, node.getBoundingClientRect().top));
      const screenshot = await page.screenshot({
        caret: "initial",
        style: "nextjs-portal { visibility: hidden; }",
        clip: { x: 0, y: Math.ceil(inset), width: viewport.width, height: viewport.height - Math.ceil(inset) },
      });
      await info.attach(name, { body: screenshot, contentType: "image/png" });
    }

    await test.step("Start with an idea and read its Compass", async () => {
      await setupClerkTestingToken({ page });
      await page.goto("/");
      await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_EMAIL! });
      await page.goto("/");
      const summary = page.getByText("Create with a guided wizard", { exact: true });
      await summary.focus();
      await page.keyboard.press("Enter");
      const wizard = summary.locator("..");
      await wizard.getByLabel("Name", { exact: true }).fill(campaign);
      await wizard.getByLabel("Original premise").fill(premise);
      await wizard.getByRole("button", { name: "Continue" }).click();
      await wizard.getByLabel("Setting", { exact: true }).fill("A salt-marsh harbor cut off by the spring tide.");
      await wizard.getByLabel("Tone", { exact: true }).fill("Hopeful coastal mystery");
      await wizard.getByRole("button", { name: "Continue" }).click();
      await wizard.getByRole("button", { name: "Create campaign", exact: true }).click();
      await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]+$/);
      await expect(page.getByRole("heading", { level: 1, name: campaign })).toBeVisible();
      await expect(page.locator("#compass").getByLabel("Current premise")).toHaveValue(premise);
      await checkWidth();
    });

    const campaignPath = new URL(page.url()).pathname;

    await test.step("Connect story and world", async () => {
      for (const entry of [
        { section: "arcs", name: arc, detail: "The Tidekeepers must keep Brinewatch's sailors safe.", button: "Create arc", route: "arcs" },
        { section: "quests", name: "Recover the beacon lens", detail: "Find who took the lens and bring it to the lantern room.", button: "Create quest", route: "quests" },
        { section: "npcs", name: "Iona Reed", detail: "The beacon keeper knows a route across the mud flats.", button: "Create NPC", route: "npcs" },
        { section: "npcs", name: "Marek Voss", detail: "A lookout torn between the smugglers and his hometown.", button: "Create NPC", route: "npcs" },
        { section: "factions", name: "The Tidekeepers", detail: "A volunteer guild that maintains the harbor lights.", button: "Create faction", route: "factions" },
        { section: "locations", name: "Brinewatch Quay", detail: "The fishing fleet gathers on the far side of this quay.", button: "Create location", route: "locations" },
        { section: "locations", name: "Lantern Room", detail: "A round room above the mud flats with a lens-shaped gap.", button: "Create location", route: "locations" },
      ]) {
        await page.goto(`${campaignPath}#${entry.section}`);
        const section = page.locator(`#${entry.section}`);
        await section.getByLabel("Name", { exact: true }).fill(entry.name);
        await section.getByLabel("Description (optional)", { exact: true }).fill(entry.detail);
        if (entry.section === "quests") await section.getByRole("checkbox", { name: arc }).check();
        await section.getByRole("button", { name: entry.button, exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`/${entry.route}/[0-9a-f-]+$`));
      }
      await page.goto(`${campaignPath}#relationships`);
      const relationships = page.getByRole("region", { name: "Relationships" });
      await relationships.getByLabel("From", { exact: true }).selectOption({ label: "NPC: Iona Reed" });
      await relationships.getByLabel("Relationship", { exact: true }).fill("keeps watch over");
      await relationships.getByLabel("To", { exact: true }).selectOption({ label: "Location: Lantern Room" });
      await relationships.getByRole("button", { name: "Create relationship" }).click();
      await expect(page).toHaveURL(/\/relationships\/[0-9a-f-]+$/);
    });

    let sessionPath = "";
    await test.step("Prepare the session and order its scenes", async () => {
      await page.goto(campaignPath);
      const prepare = page.getByRole("link", { name: "Preparar una nueva sesión", exact: true });
      await prepare.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("#prepare-session")).toBeFocused();
      const sessions = page.getByRole("region", { name: "Sessions", exact: true });
      await sessions.getByLabel("Title", { exact: true }).fill(session);
      await sessions.getByText("Planned date and notes (optional)", { exact: true }).click();
      await sessions.getByLabel("Preparation", { exact: true }).fill(plan);
      await sessions.getByRole("button", { name: "Create session", exact: true }).click();
      await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]+$/);
      sessionPath = new URL(page.url()).pathname;

      for (const [title, notes] of [
        ["Meet at the quay", "Iona shows the way across the flats."],
        [scene, scenePlan],
      ]) {
        await page.locator("#new-scene-title").fill(title);
        await page.locator("#new-scene-plan").fill(notes);
        await page.getByRole("button", { name: "Add scene", exact: true }).click();
        await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
        await expect(page.locator("#new-scene-title")).toHaveValue("");
      }
      await checkWidth();
    });

    await test.step("Build and place an encounter", async () => {
      await page.goto(`${campaignPath}#encounters`);
      const encounters = page.getByRole("region", { name: "Encounters", exact: true });
      await encounters.getByLabel("Title", { exact: true }).fill(encounter);
      await encounters.getByRole("button", { name: "Create encounter", exact: true }).click();
      await expect(page).toHaveURL(/\/encounters\/[0-9a-f-]+$/);
      await page.locator("#new-creature-name").fill("Bandit");
      await page.locator("#new-creature-xp").fill("25");
      await page.locator("#new-creature-quantity").fill("2");
      await page.getByRole("button", { name: "Add creature", exact: true }).click();
      const budget = page.getByRole("region", { name: "XP budget" });
      await expect(budget).toContainText("Low 200 · Moderate 300 · High 400 XP");
      await expect(budget).toContainText("Planned creatures: 50 XP.");

      await page.goto(sessionPath);
      const placement = page.getByRole("region", { name: "Planned encounters" });
      await placement.getByLabel("Encounter", { exact: true }).selectOption({ label: encounter });
      await placement.getByRole("button", { name: "Place in session", exact: true }).click();
      await expect(placement.getByRole("link", { name: encounter, exact: true })).toBeVisible();
    });

    await test.step("Run the encounter and preserve preparation in Recap", async () => {
      await page.goto(campaignPath);
      const home = page.getByRole("region", { name: "Campaign Home", exact: true });
      await expect(home.getByRole("heading", { name: session, exact: true })).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await capture("Campaign Home");
      await home.getByRole("link", { name: "Run", exact: true }).click();
      await expect(page).toHaveURL(`${sessionPath}/run`);
      await expect(page.getByRole("heading", { name: scene, exact: true })).toBeVisible();
      const runForm = page.locator("form").filter({ has: page.getByRole("heading", { name: `Record ${encounter}` }) });
      await runForm.getByLabel("What happened", { exact: true }).fill(encounterOutcome);
      await runForm.getByRole("button", { name: "Save encounter run", exact: true }).click();
      await expect(page.getByText(encounterOutcome, { exact: true })).toBeVisible();
      await expect(page.getByText("2 × Bandit (25 XP each)", { exact: true })).toBeVisible();
      await page.getByRole("link", { name: "Record outcomes" }).click();
      await expect(page).toHaveURL(`${sessionPath}/recap`);
      const recap = page.getByRole("region", { name: "Session outcome", exact: true });
      const revision = recap.locator('input[name="expectedRevision"]');
      const before = Number(await revision.inputValue());
      await recap.getByLabel("What actually happened?").fill(sessionOutcome);
      await recap.getByRole("button", { name: "Save session outcome" }).click();
      await expect(revision).toHaveValue(String(before + 1));
      const sceneRecap = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: scene, exact: true }) });
      await sceneRecap.getByLabel("What happened in this scene?").fill(sceneOutcome);
      await sceneRecap.getByRole("button", { name: "Save scene outcome" }).click();
      await expect(revision).toHaveValue(String(before + 2));
      await page.reload();
      await expect(recap.getByLabel("What actually happened?")).toHaveValue(sessionOutcome);
      await expect(sceneRecap.getByLabel("What happened in this scene?")).toHaveValue(sceneOutcome);
      await recap.getByText("Show session preparation", { exact: true }).click();
      await sceneRecap.getByText("Show preparation", { exact: true }).click();
      await expect(recap.getByText(plan, { exact: true })).toBeVisible();
      await expect(sceneRecap.getByText(scenePlan, { exact: true })).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await capture("Session Recap");
    });

    await test.step("Grant a planned reward and export the campaign PDF", async () => {
      await page.goto(`${campaignPath}#rewards`);
      const rewards = page.getByRole("region", { name: "Rewards", exact: true });
      await rewards.getByLabel("Title", { exact: true }).fill(reward);
      await rewards.getByRole("button", { name: "Plan reward", exact: true }).click();
      await expect(page).toHaveURL(/\/rewards\/[0-9a-f-]+$/);
      await page.locator("#new-component-kind").selectOption("ACCESS");
      await page.locator("#new-component-description").fill(component);
      await page.getByRole("button", { name: "Add component", exact: true }).click();
      const grant = page.getByRole("region", { name: "Record a grant" });
      await grant.getByRole("checkbox", { name: `access: ${component}`, exact: true }).check();
      await grant.getByLabel("Given to").fill("The Lantern Crew");
      await grant.getByLabel("Session (optional)").selectOption({ label: session });
      await grant.getByRole("button", { name: "Record grant", exact: true }).click();
      await expect(page.getByRole("region", { name: "Grant ledger" })).toContainText("The Lantern Crew");

      await page.goto(`${campaignPath}#grant-ledger`);
      const ledger = page.getByRole("region", { name: "Grant ledger" });
      await expect(ledger).toContainText(reward);
      await expect(ledger).toContainText(session);
      await expect(ledger).toContainText(component);
      const moduleResponse = await page.request.get(`${campaignPath}/export/module`);
      expect(moduleResponse.ok()).toBe(true);
      const moduleText = await moduleResponse.text();
      for (const evidence of [campaign, "Recover the beacon lens", "keeps watch over", sceneOutcome, encounterOutcome, component]) {
        expect(moduleText).toContain(evidence);
      }

      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("link", { name: "Download campaign PDF", exact: true }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.pdf$/);
      const pdf = await readFile(await download.path());
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pdf.subarray(-128).toString()).toContain("%%EOF");
      await info.attach("Campaign PDF", { body: pdf, contentType: "application/pdf" });
    });
  });
}
