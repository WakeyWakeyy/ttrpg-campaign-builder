# Demo rehearsal — The Last Light of Brinewatch

A coastal mystery for four level-one characters. Relight the harbor beacon before the spring tide strands the fishing fleet.

## Run locally

Use [the existing authenticated browser setup](browser-proof.md) with a dedicated test database and a Clerk development account.

```sh
pnpm exec playwright test tests/e2e/demo-alpha.spec.ts --reporter=list,html
```

Playwright applies the committed migrations to its own temporary schema and creates the campaign through the same screens a GM uses. The two viewport runs create independent campaigns. The report attaches Campaign Home, Session Recap, and the downloaded module PDF for each viewport. Open the PDF to review the table of contents and the expected story, encounter, outcome, and reward sections. These artifacts are local test output. Export only fictional campaign material when preparing evidence for sharing.

Campaign Home review captures from the authenticated Chromium rehearsal at [1440px](images/demo-alpha-home-desktop.png) and [390px](images/demo-alpha-home-mobile.png).

## Presenter walkthrough

Use a local development instance with a dedicated demo database if you want the campaign to persist after rehearsal. Start a new campaign each time.

1. On the dashboard, open **Create with a guided wizard**. Name the campaign **The Last Light of Brinewatch**. Enter the premise above, the setting **A salt-marsh harbor cut off by the spring tide**, and the tone **Hopeful coastal mystery**. Review, create, and confirm the Campaign Compass.
2. Create **The Harbor Goes Dark** in Arcs. Create the Quest **Recover the beacon lens** and select that Arc. The Tidekeepers need the lens back before the fleet approaches the harbor.
3. Add the NPCs **Iona Reed**, the beacon keeper, and **Marek Voss**, a conflicted smuggler lookout. Add **The Tidekeepers** faction, **Brinewatch Quay**, and **Lantern Room**. Create the relationship **Iona Reed → keeps watch over → Lantern Room**.
4. From Campaign Home use **Preparar una nueva sesión**. Create **A light before high tide**. Open **Planned date and notes (optional)** and write that the crew should ask Iona about the lens and reach the beacon at low tide. Add the scenes **Meet at the quay** and **At the lantern room** in that order.
5. Create **Smugglers at the beacon** under Encounters for four level-one characters. Add two **Bandit** creatures worth **25 XP** each. Verify **50 XP** under XP budget. Return to the Session and place the encounter.
6. From Campaign Home select **Run**. Record that the lookout surrendered and the other bandit fled. Open **Record outcomes** and save the Session outcome, **The beacon was relit and the fishing fleet returned safely**. Record in the second scene that Iona seated the recovered lens just before high tide. Expand preparation to compare the accepted outcomes with the plan.
7. Plan **The Tidekeepers' thanks** under Rewards. Add **A harbor pass and safe berth through winter** as an **access** component. Record a grant to **The Lantern Crew**, selecting that component and the Session. Verify both the recipient and the Session in the Campaign grant ledger.
8. Under Export, download **campaign PDF**. Open it and verify the linked index, the World/Story material, the planned and played encounter, the accepted Session/Scene outcomes, and the grant.

The browser test has the exact fixture text for each form. There is no automatic production seed.

## Export visual debt

The bundled font shows a missing glyph for the directional arrow in generated relationship headings. Both entity names and the relationship text remain visible. Keep the exported fixture as a visual regression reference when addressing font coverage.
