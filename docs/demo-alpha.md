# Demo Alpha

Demo Alpha is the next milestone for TTRPG Campaign Builder. It validates one private GM workflow on existing campaign data and mechanics.

## Main journey

1. Turn an idea into a Campaign through the guided Wizard and confirm its Compass.
2. Give the Campaign a playable situation with one Arc, a linked Quest, NPCs, a Faction, Locations, and a relationship or continuity record.
3. Prepare a Session with ordered Scenes. Build an Encounter with creature groups, check its XP against the pinned SRD 5.2.1 budget, and place it in the Session or a Scene.
4. Open Run View from the Campaign and record the encounter as played.
5. Open Recap and save the Session and at least one Scene outcome while retaining preparation.
6. Plan a Reward and record a grant linked to the Session. Check the ledger for the recipient and granted component.
7. Download a private PDF and check that it contains the expected campaign or session material.

## Acceptance

- A fresh run starts with an idea and ends with a readable PDF. Use a dedicated development or test environment and reproducible fictional material.
- A GM can follow the primary route by keyboard and at desktop and narrow mobile widths. The route has visible focus, useful empty states, and no horizontal page overflow.
- Same-page navigation and disclosure preserve pending input. Leaving a dirty editor follows its documented navigation guard. Outcome capture preserves preparation.
- Existing ownership, authorization, same-Campaign constraints, revisions, transactions, lifecycle, and persisted idempotency remain authoritative.
- Required evidence includes frozen install, dependency audit, unit and real PostgreSQL integration tests, focused authenticated Playwright, lint, typecheck and production build. Capture the journey at desktop and mobile widths with fictional data only. Record failures, observed causes and rerun outcomes.

## Prioritized backlog

| Priority | Delivery | Acceptance evidence |
| --- | --- | --- |
| P0 | Consolidate CH01 | Review against current main, check exact-head CI, verify keyboard, responsive layout, read scope and draft retention. |
| P0 | Campaign Home and Session preparation pass | Clear entry to prepare or resume a Session, contextual links and progressively disclosed creation with mounted drafts. |
| P0 | Reproducible Golden Path | Fictional campaign procedure, authenticated browser coverage through the grant ledger and valid PDF, desktop and mobile captures. |
| P1 | Resilience in the demo route | Verify validation recovery, retry outcomes, navigation cancel and direct links on the principal editors. Fix concrete blockers exposed during rehearsal. |
| P1 | Rehearsal and accessibility polish | Exercise the route at a narrow viewport and with keyboard, review the exported PDF and record environment and known limits. |
| P2 | Follow-up improvements | Evaluate improvements outside the primary route, remaining lifecycle recovery and additional PDF formats after the demo. |

Demo Alpha uses the current modular monolith and pinned ruleset. Generative AI, maps, VTT, new rulesets, external services, and a broad D02 Phase 2 rollout are outside this milestone.

## Integration and migration validation

After CH01 lands, refresh this documentation branch from main, preserve the CH01 entry in the roadmap, and rerun the required CI on the new head. Review the UX changes against the updated main. Keep the rehearsal PR scoped to its fixture, Playwright spec, and evidence when changing its base. On the integrated main revision, rerun frozen install, audit, units, PostgreSQL migrations and integration, authenticated Playwright at both supported demo viewports, lint, typecheck, and build.

The pre-existing local test database has `public.session` and lacks `public.scene`. Its Drizzle ledger contains `0017_campaign_session`, `0020_green_spencer_smythe`, and `0021_classy_captain_stacy`, with no records for 0018 or 0019. In the journal, the timestamps of 0018 (which creates Scene) and 0019 are older than 0017. Drizzle compares each entry with the newest applied timestamp, so an incremental run from 0017 skips both. The later encounter-placement migration references Scene and fails against that database. Empty-database CI and the isolated browser schemas apply the journal in sequence.

Use a fresh dedicated database for candidate validation. Before reusing an existing database for the private deployment, verify its migration ledger and application tables in read-only mode. A database with the same gaps needs a separate reviewed migration plan.
