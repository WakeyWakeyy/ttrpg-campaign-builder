# Roadmap

This roadmap is an implementation sequence, not a promise of dates. Later work moves forward only when it helps validate the core product.

## 1. Architecture proof — complete

The architecture-proof vertical slice is complete. Foundation through A8:

- app bootstrap;
- PostgreSQL 18 + Drizzle migrations;
- unit tests and real PostgreSQL integration tests;
- provider-neutral identity persistence;
- Ruleset / immutable Ruleset Version foundation;
- Campaign root persistence, internal-user ownership, and Ruleset Version pinning;
- Campaign Compass persistence;
- Campaign archive/trash database invariants;
- shared `campaign_entity` registry and typed Location persistence, with same-Campaign constraints and database tests for atomic creation, revision safety, and lifecycle behavior;
- CI validation and protected `main`;
- technical operation safety persistence (A5);
- Clerk authentication and internal Actor boundary (A6);
- owner-scoped Campaign queries and atomic creation with Ruleset pin and Compass (A7);
- owner-scoped Location commands, revision-safe edits, concurrent hierarchy validation,
  and Archive → Trash → Restore application behavior (A8).

**A9–A10 completed the proof.** A9 delivered the minimal sign-in, Campaign/Location UI, visible revision conflicts, and Archive/Trash/Restore. A10 passed locally, merged in [PR #17](https://github.com/WakeyWakeyy/ttrpg-campaign-builder/pull/17), and passed the [authenticated remote browser run](https://github.com/WakeyWakeyy/ttrpg-campaign-builder/actions/runs/37420021628) on `main`. The required CI validation also passed. The end-to-end slice is green, and PostgreSQL integration tests cover the integrity constraints. See [browser proof setup](browser-proof.md) and [A10 validation](a10-validation.md).

## 2. Campaign creation slice

Build the first product-facing workflow:

- Dashboard and Create Campaign: A11 implements an initial campaign list grouped by lifecycle state and a creation form for the existing Campaign and Compass fields. See [A11 progress](a11-campaign-start.md).
- optional guided Campaign Wizard: A13 provides an idea → context → review path alongside direct creation. See [A13 progress](a13-campaign-wizard.md);
- Campaign Compass reading and editing over the existing persistence foundation: A12 shows the original creative record and adds revision-safe edits for current premise, setting, and tone. See [A12 progress](a12-campaign-compass.md).
- Blueprint Draft: A14 provides private pre-Campaign drafts with owner-scoped, revision-safe editing. See [A14 progress](a14-blueprint-draft.md);
- Blueprint Review and partial acceptance: A15 persists individually addressable Location proposals and their decisions;
- transactional Blueprint → Campaign materialization: A15 creates a new Campaign from accepted Locations with persisted idempotency and a one-Campaign-per-Blueprint guard. See [A15 contract and validation](a15-blueprint-review-materialization.md);
- Campaign Workspace shell: A16 organizes the existing Campaign status, Compass, and Locations in one navigable page. See [A16 progress](a16-campaign-workspace.md).

## 3. Campaign Core

Expand the connected domain model:

- Arcs: A17 adds a typed Arc with owner-scoped, revision-safe commands and the same preservation lifecycle as Locations. See [A17 progress](a17-campaign-arcs.md);
- Quests / plot threads: A18 adds typed Quests, outcome status, parent hierarchy, and Arc membership. See [A18 progress](a18-campaign-quests.md);
- NPCs: A19 adds typed NPCs with identity, role, current state, revision-safe editing, and preservation lifecycle. See [A19 progress](a19-campaign-npcs.md);
- Player Characters and Party summary: A20 adds lightweight PCs and Parties with explicit composition and revision-safe editing. See [A20 progress](a20-player-characters-parties.md);
- Factions and memberships: A21 adds typed Factions and NPC/PC memberships with role, rank, and active/former state. See [A21 progress](a21-campaign-factions.md);
- Locations and Travel Routes: A22 connects existing Locations with typed Travel Routes for distance, duration, mode, hazards, and GM notes. See [A22 progress](a22-travel-routes.md);
- Items: A23 adds important objects with an exclusive current Location or NPC/PC holder, revision-safe editing, and preservation lifecycle. See [A23 progress](a23-campaign-items.md);
- semantic Relationships: A24 adds owner-scoped links between Campaign entities with GM-defined semantics, revision-safe editing, and preservation lifecycle. See [A24 progress](a24-semantic-relationships.md);
- basic Timeline: A25 records narrative events with optional real and in-world dates, multiple entity links, revision-safe editing, and preservation lifecycle. See [A25 progress](a25-basic-timeline.md).

## 4. Sessions

Make recurring preparation useful:

**Current stage:** Session preparation, Scenes, previous-session context, per-session attendance, Run View, focused post-session outcome capture, and reusable preparation are complete. Rules, Encounters, and Rewards is next.

- Session preparation: A26 adds an owner-scoped Session with separate plan and outcome fields, revision-safe edits, and preservation lifecycle. See [A26 progress](a26-session-preparation.md);
- Scenes: A27 adds ordered preparation beats within a Session, with separate outcomes, revision-safe edits, and recoverable trash. See [A27 progress](a27-session-scenes.md);
- previous-session context: the Session page shows the latest earlier, available Session's outcome and recorded Scene outcomes so the GM can prepare with what happened in view (merged in PR #41);
- attendance override: a Session records its own explicit set of attending Player Characters, including an intentional empty set, without editing Party membership (merged in [PR #42](https://github.com/WakeyWakeyy/ttrpg-campaign-builder/pull/42));
- quick-reference / Run View: a focused table view of previous outcomes, attendance, preparation, and available Scenes, with a link back to editing;
- post-session outcome capture: a dedicated recap page records the Session and individual Scene outcomes with revision protection while preserving their preparation;
- reusable preparation when plans change: a GM can copy a Session's plan and available Scenes into a new Session, leaving the source intact and starting with empty outcomes, attendance, and date. Retrying the same request returns the original copy.

## 5. Rules, Encounters, and Rewards

Add deterministic game support:

**Current stage:** The SRD 5.2.1 reference index, deterministic XP budgets, Encounter Builder, reusable placements, Encounter Run history, and Reward planning are available. Reward Grants and the ledger are next.

- SRD-backed rules/reference foundation: a version-scoped, source-attributed index links GMs to selected sections of the official SRD from their Campaign workspace. This is a navigation foundation, not a complete rules compendium;
- deterministic encounter calculations: a version-bound calculator shows low, moderate, and high XP budgets for an equal-level party and compares a creature XP total with them; it does not save an Encounter. See [calculation scope](encounter-budgets.md);
- Encounter Builder: a Campaign owns a standalone Encounter definition with notes, party level and size, and named creature groups. The GM can revise or recover the plan while seeing its XP total against the pinned SRD budget. See [builder scope](encounter-builder.md);
- reusable Encounter definitions and placements: a GM can place a Campaign Encounter in a Session or Scene more than once, remove a placement without deleting its definition, and carry available placements into a copied Session;
- Encounter Run history: the Run View records played or improvised encounters, the outcome, and a snapshot of planned creature groups. Later edits to the reusable definition do not rewrite the record. See [run history scope](encounter-run-history.md);
- Reward planning: a Campaign holds reusable plans with individually editable components for material and narrative gains. Revision-safe edits and recovery preserve preparation without implying a grant. See [planning scope](reward-planning.md);
- Reward Grants / ledger.

## 6. Campaign Intelligence

Add contextual assistance after enough structured campaign state exists:

- continuity checks;
- timeline conflicts;
- inaccessible clues / secrets;
- unresolved or abandoned threads;
- contextual suggestions;
- source-aware summaries;
- configurable proactive assistance.

## 7. Export and publishing

Turn structured data into practical GM outputs:

- Markdown / JSON portability;
- session sheets;
- campaign overview;
- detailed module-style output;
- quick-reference sheets;
- PDF once the editorial/export model is stable.

## Later, only after the core workflow proves useful

Potential later work includes:

- richer homebrew support;
- map semantics and tactical Map Engine;
- VTT export;
- additional rulesets;
- player-safe outputs;
- collaboration;
- personal private rules-library workflows;
- advanced simulations and tactical analysis.

## Roadmap rule

A feature moves earlier only for a clear product reason. Novelty, architecture fashion, or the existence of an interesting API is not enough.
