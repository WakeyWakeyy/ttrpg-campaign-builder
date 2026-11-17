import { expect, test } from "@playwright/test";
import { planningCampaign } from "./planning-draft-helpers";
import { testPool } from "./database";

async function seedSession(pool: ReturnType<typeof testPool>, campaignId: string, title: string, updatedAt = "2026-10-01", state = "ACTIVE") {
  const result = await pool.query(`WITH entity AS (
    INSERT INTO campaign_entity(campaign_id,entity_type,created_by_user_id,updated_at,archived_at,deleted_at,purge_after)
    SELECT id,'SESSION',owner_user_id,$3::timestamptz,
      CASE WHEN $4='ARCHIVED' THEN now() END, CASE WHEN $4='TRASH' THEN now() END,
      CASE WHEN $4='TRASH' THEN now()+interval '30 days' END
    FROM campaign WHERE id=$1 RETURNING id,campaign_id)
    INSERT INTO session(id,campaign_id,title) SELECT id,campaign_id,$2 FROM entity RETURNING id`, [campaignId,title,updatedAt,state]);
  return result.rows[0].id as string;
}
const home = (page: import("@playwright/test").Page) => page.getByRole("region", {name:"Campaign Home",exact:true});
// Playwright's default caret hiding mutates native inputs' inline styles while
// the retained workspace may still be hydrating. Capture without that mutation;
// omit only the development toolbar from the review images.
const capture = {caret:"initial" as const,style:"nextjs-portal { visibility: hidden; }"};

test("new campaign offers preparation without prerequisites and keeps the original workspace", async ({page}) => {
  const campaignId = await planningCampaign(page), entry = home(page);
  await expect(page.getByRole("heading",{level:1,name:"Planning drafts"})).toBeVisible();
  await expect(entry.getByText("Preserve independent GM ideas.",{exact:true})).toBeVisible();
  await expect(entry.getByText(/No hay sesiones activas/)).toBeVisible();
  await expect(entry.getByRole("heading",{name:"Sesiones actualizadas recientemente"})).toBeVisible();
  await expect(entry.locator("form")).toHaveCount(0);
  await expect(page.locator("form")).toHaveCount(18);
  expect(await entry.evaluate(node=>Boolean(node.nextElementSibling?.classList.contains("workspace-layout")))).toBe(true);
  await page.goto(`/campaigns/${campaignId}#sessions`);
  await expect(page.locator("#sessions")).toBeInViewport();
  await entry.getByRole("link",{name:"Preparar una nueva sesión",exact:true}).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/campaigns/${campaignId}#prepare-session$`));
  await expect(page.locator("#prepare-session")).toBeFocused();
  const original = page.getByRole("region",{name:"Sessions",exact:true});
  await original.getByLabel("Title",{exact:true}).fill("First playable session");
  await original.getByRole("button",{name:"Create session",exact:true}).click();
  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]+$/);
  await expect(page.locator("#session-title")).toHaveValue("First playable session");
});

test("one, three and more sessions use stable update order, exclude lifecycle records and link to all three modes", async ({page}) => {
  const pool=testPool();
  try {
    const campaignId=await planningCampaign(page);
    const first=await seedSession(pool,campaignId,"Harbor preparations");
    await page.goto(`/campaigns/${campaignId}`);
    await expect(home(page).getByRole("navigation",{name:/^Continuar /})).toHaveCount(1);
    const second=await seedSession(pool,campaignId,"Mountain crossing");
    const third=await seedSession(pool,campaignId,"The negotiation");
    const tied=[first,second,third].sort();
    await page.reload();
    expect(await home(page).getByRole("link",{name:"Preparar",exact:true}).evaluateAll(nodes=>nodes.map(n=>n.getAttribute("href"))))
      .toEqual(tied.map(id=>`/sessions/${id}`));
    const newest=await seedSession(pool,campaignId,"Council of tides — a long session title for narrow screens","2026-11-01");
    await seedSession(pool,campaignId,"Old plan","2026-09-01");
    await seedSession(pool,campaignId,"Archived plan","2030-01-01","ARCHIVED");
    await seedSession(pool,campaignId,"Trashed plan","2030-01-02","TRASH");
    const before=(await pool.query("SELECT xmin::text,to_jsonb(ce) AS record FROM campaign_entity ce WHERE campaign_id=$1 ORDER BY id",[campaignId])).rows;
    await page.reload();
    const expected=[newest,...tied.slice(0,2)];
    expect(await home(page).getByRole("link",{name:"Preparar",exact:true}).evaluateAll(nodes=>nodes.map(n=>n.getAttribute("href"))))
      .toEqual(expected.map(id=>`/sessions/${id}`));
    await expect(home(page).getByText("Archived plan",{exact:true})).toHaveCount(0);
    await expect(home(page).getByText("Trashed plan",{exact:true})).toHaveCount(0);
    for (const [label,suffix] of [["Preparar",""],["Run","/run"],["Recap","/recap"]]) {
      const link=home(page).getByRole("link",{name:label,exact:true}).first();
      await expect(link).toHaveAttribute("href",`/sessions/${newest}${suffix}`);
      await link.click();
      await expect(page).toHaveURL(`http://localhost:3100/sessions/${newest}${suffix}`);
      await expect(page.getByRole("heading",{level:1})).toContainText("Council of tides");
      await page.goto(`/campaigns/${campaignId}`);
    }
    expect((await pool.query("SELECT xmin::text,to_jsonb(ce) AS record FROM campaign_entity ce WHERE campaign_id=$1 ORDER BY id",[campaignId])).rows).toEqual(before);
    await page.setViewportSize({width:1440,height:1000});
    await page.screenshot({path:"playwright-report/ch01-desktop.png",...capture});
    await home(page).screenshot({path:"playwright-report/ch01-desktop-entry.png",...capture});
    await page.setViewportSize({width:390,height:844});
    const entry=home(page);
    expect(await entry.evaluate(node=>node.scrollWidth<=node.clientWidth && node.getBoundingClientRect().right<=window.innerWidth)).toBe(true);
    await page.screenshot({path:"playwright-report/ch01-mobile.png",...capture});
    await entry.screenshot({path:"playwright-report/ch01-mobile-entry.png",...capture});
  } finally {await pool.end();}
});

test("anchors keep mounted drafts, canceled Home links keep values/revisions, and accepted links do not save", async ({page}) => {
  const pool=testPool();
  try {
    const campaignId=await planningCampaign(page), id=await seedSession(pool,campaignId,"Choose me");
    await page.reload();
    const premise=page.locator("#currentPremise"), sessionTitle=page.locator("#new-session-title");
    await premise.fill("Local compass direction"); await sessionTitle.fill("Unsubmitted session");
    const revision=page.locator('input[name="expectedRevision"]').first(), base=await revision.inputValue();
    await premise.evaluate(node=>node.setAttribute("data-ch01-draft","mounted"));
    let accept=false; const dialogs:string[]=[];
    page.on("dialog",async dialog=>{dialogs.push(dialog.type());if(accept)await dialog.accept();else await dialog.dismiss();});
    for (const anchor of await home(page).locator('a[href^="#"]').all()) {
      const href=await anchor.getAttribute("href");
      expect(await page.locator(href!).count()).toBe(1);
      await anchor.click();
      await expect(page).toHaveURL(`http://localhost:3100/campaigns/${campaignId}${href}`);
      await expect(page.locator(href!)).toBeInViewport();
      await expect(premise).toHaveValue("Local compass direction");
      await expect(sessionTitle).toHaveValue("Unsubmitted session");
      await expect(premise).toHaveAttribute("data-ch01-draft","mounted");
      await expect(revision).toHaveValue(base);
    }
    expect(dialogs).toEqual([]);
    const before=(await pool.query("SELECT current_premise,revision FROM campaign_compass WHERE campaign_id=$1",[campaignId])).rows;
    const current=page.url(), history=await page.evaluate(()=>window.history.length);
    for (const label of ["Preparar","Run","Recap","Lo que ocurrió","Threads para revisar"]) {
      await home(page).getByRole("link",{name:label,exact:true}).click();
      await expect(page).toHaveURL(current);
      await expect(premise).toHaveValue("Local compass direction");
      await expect(sessionTitle).toHaveValue("Unsubmitted session");
      await expect(revision).toHaveValue(base);
    }
    expect(dialogs).toEqual(Array(5).fill("confirm"));
    expect(await page.evaluate(()=>window.history.length)).toBe(history);
    expect((await pool.query("SELECT current_premise,revision FROM campaign_compass WHERE campaign_id=$1",[campaignId])).rows).toEqual(before);
    accept=true;
    await home(page).getByRole("link",{name:"Preparar",exact:true}).click();
    await expect(page).toHaveURL(`http://localhost:3100/sessions/${id}`);
    expect((await pool.query("SELECT current_premise,revision FROM campaign_compass WHERE campaign_id=$1",[campaignId])).rows).toEqual(before);
    expect((await pool.query("SELECT title FROM session WHERE campaign_id=$1",[campaignId])).rows).toEqual([{title:"Choose me"}]);
  } finally {await pool.end();}
});

test("Home is Campaign-scoped and a foreign Campaign never reveals its session or Compass", async ({page}) => {
  const pool=testPool();
  try {
    const campaignId=await planningCampaign(page);
    await seedSession(pool,campaignId,"Owned session");
    const owner=(await pool.query("INSERT INTO user_account DEFAULT VALUES RETURNING id")).rows[0].id;
    const foreign=(await pool.query("INSERT INTO campaign(owner_user_id,name) VALUES($1,'PRIVATE CAMPAIGN') RETURNING id",[owner])).rows[0].id;
    await pool.query("INSERT INTO campaign_compass(campaign_id,original_premise,current_premise) VALUES($1,'PRIVATE ORIGINAL','PRIVATE DIRECTION')",[foreign]);
    await seedSession(pool,foreign,"PRIVATE SESSION","2030-01-01");
    await page.reload();
    await expect(home(page).getByRole("heading",{name:"Owned session",exact:true})).toBeVisible();
    await expect(page.getByText("PRIVATE SESSION",{exact:true})).toHaveCount(0);
    await page.goto(`/campaigns/${foreign}`);
    await expect(page.getByRole("heading",{name:"Not found",exact:true})).toBeVisible();
    await expect(home(page)).toHaveCount(0);
    await expect(page.getByText(/PRIVATE (CAMPAIGN|DIRECTION|SESSION)/)).toHaveCount(0);
  } finally {await pool.end();}
});
