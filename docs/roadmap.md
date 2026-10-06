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
- Blueprint Draft;
- Blueprint Review and partial acceptance;
- transactional Blueprint → Campaign materialization;
- Campaign Workspace shell.

## 3. Campaign Core

Expand the connected domain model:

- Arcs;
- Quests / plot threads;
- NPCs;
- Player Characters and Party summary;
- Factions and memberships;
- Locations and Travel Routes;
- Items;
- semantic Relationships;
- basic Timeline.

## 4. Sessions

Make recurring preparation useful:

- Session preparation;
- optional Scenes;
- previous-session context;
- attendance override;
- quick-reference / Run View;
- post-session outcome capture;
- reusable preparation when plans change.

## 5. Rules, Encounters, and Rewards

Add deterministic game support:

- SRD-backed rules/reference foundation;
- deterministic encounter calculations;
- Encounter Builder;
- reusable Encounter definitions and placements;
- Encounter Run history;
- Reward planning;
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
