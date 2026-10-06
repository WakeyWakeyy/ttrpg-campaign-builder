# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Product Purpose

TTRPG Campaign Builder helps Dungeon Masters and Game Masters turn campaign ideas into structured, connected, playable material while preserving their creative ownership.

The application should reduce repetitive preparation and administrative work. It should help the GM organize, calculate, connect, remember, and prepare — not replace the GM as author.

## Operating Context

Campaign preparation often lives across many independent tools:

- freeform notes;
- wikis and documents;
- spreadsheets;
- rulebooks and reference sites;
- encounter calculators;
- VTTs;
- map tools;
- PDFs;
- general-purpose AI assistants.

Those tools are useful, but the campaign still has to become one coherent system. NPCs matter to quests. Quests lead to locations. Sessions change world state. Encounters consume resources. Clues become known. Rewards are granted. Plans diverge from what actually happened.

The product is built around that continuity problem.

## Users

The long-term target is any GM creating original campaign material.

The MVP should be approachable for beginner and intermediate GMs without becoming inefficient for experienced GMs. Guidance should be optional and contextual rather than forcing users into separate beginner/expert modes.

A representative need is:

> I have ideas, but I need help turning them into something structured and runnable.

## Positioning

The differentiator is a **Campaign Design Workflow**, not a single generator.

The product should help move through a connected process:

```text
Idea
  → Campaign structure
  → World
  → Arcs / quests
  → Sessions
  → Encounters / rewards
  → Run
  → Record consequences
  → Continue
```

The campaign behaves as connected data with useful freeform notes, not as a folder of isolated generated documents.

## Product Principles

### GM-first

The GM makes creative decisions. Suggestions remain optional. Meaningful narrative changes are never applied silently.

### GM content has priority

Conceptually:

```text
GM-authored content
  > accepted generated content
  > unaccepted generated content
```

AI output is not campaign truth until accepted.

### Rules, analysis, and suggestions are different

The UI and application logic should distinguish:

- **Rules** — deterministic information calculated from the selected ruleset;
- **Analysis** — interpretation or estimate based on campaign state;
- **Suggestion** — an optional creative direction.

Uncertain analysis should not be presented as mechanical certainty.

### Structured data before AI

Preferred order:

```text
Structured data → Rules / algorithms → AI
```

If a deterministic system can answer reliably, do not spend a model call or introduce model uncertainty.

### Create first, organize progressively

Capturing an idea should be fast. Structure is added when it helps relationships, rules, continuity, preparation, or export.

Freeform notes remain available even when structured fields exist.

### Preserve rather than erase

Reorganizing a campaign should not destroy work. Moving a scene, unlinking a quest, scrapping a session plan, archiving an NPC, or changing a hierarchy are distinct from permanent deletion.

### Continuity is advisory

Campaign Intelligence can surface contradictions, inaccessible clues, abandoned threads, timeline conflicts, or forgotten entities. These are warnings and suggestions, not narrative errors the application is allowed to fix automatically.

## MVP hypothesis

A GM can turn a rough campaign idea into a structured, connected campaign and prepare runnable sessions with less administrative overhead than when using a collection of unrelated tools.

## Capabilities and Constraints

The MVP is expected to cover:

- authentication and persistent Campaigns;
- guided but optional campaign creation;
- Campaign structure and workspace;
- arcs and quests / plot threads;
- NPCs, factions, and locations;
- sessions and optional scenes;
- encounters and rewards;
- semantic relationships;
- basic Timeline / campaign state;
- deterministic rules support for the initial ruleset;
- contextual AI proposals and consistency assistance;
- practical exports as the data model matures.

## Evidence on Hand

The current application and its tests provide evidence for the architecture-proof slice only: authentication to an internal Actor, Campaign creation and reopening, pinned Ruleset Version, Location creation and revision-safe editing, and Archive, Trash, and Restore. See `docs/a10-validation.md` and `docs/browser-proof.md` for the recorded local validation and its CI limitation. The broader MVP capabilities above remain intended scope, not claims of implementation.

## Important product concepts

### Campaign Compass

A small persistent description of the GM's intended tone, themes, boundaries, and campaign direction. It is context for assistance, not a system that overrides campaign content.

### Blueprint Draft

A structured proposal produced during campaign creation. It is separate from Campaign truth and can be partially accepted, edited, or discarded.

### Preparation vs play history

The product distinguishes what is planned from what actually happened. Session preparation, Encounter definitions, Timeline events, and execution records should not collapse into one mutable object.

### Detailed vs run-oriented views

The same campaign data can support two information densities:

- preparation/detail view for understanding and editing;
- quick-reference/run view for use during a session.

## Initial ruleset

The first implementation targets fifth-edition-compatible functionality using legally reusable SRD material.

Campaign Core is intentionally ruleset-neutral. Rules-specific calculations and reference data are accessed through a Ruleset boundary so the product is not structurally tied to D&D.

## Non-goals for the MVP

The MVP is not intended to become:

- a VTT;
- a full D&D character builder;
- a marketplace;
- a multiplayer collaboration platform;
- a native mobile application;
- a multi-ruleset platform at launch;
- an advanced battlemap generator;
- a replacement for the GM.

## Success criterion

The product is moving in the right direction when it meaningfully reduces the distance between:

> I have an idea for a campaign.

and:

> I can run the next session.
