# TTRPG Campaign Builder

A campaign design and preparation application for tabletop RPG Game Masters.

**Status:** implementation bootstrap · **Core stack:** TypeScript, Next.js, PostgreSQL, Drizzle

The goal is to help a GM turn an initial idea into connected, playable campaign material — arcs, quests, NPCs, locations, sessions, encounters, rewards, and continuity — without taking creative control away from them.

> **North Star:** I still feel like I created this campaign, but I had an entire team helping me prepare it.

## Why this project exists

Campaign preparation is often scattered across notes, wikis, spreadsheets, encounter calculators, rulebooks, VTTs, PDFs, and AI chats.

The hard part is not generating more content. It is keeping campaign ideas **structured, connected, consistent, easy to prepare, and usable at the table** as the campaign evolves.

TTRPG Campaign Builder explores a workflow-first approach:

```text
Idea → Campaign Structure → World → Quests → Sessions → Encounters → Consequences → Continue
```

The application assists with organization, deterministic rules, consistency checks, and optional generation. The GM remains the author and final decision-maker.

## Product principles

- **GM-first:** important narrative decisions are never changed silently.
- **Structured data before AI:** use relational data and deterministic rules where they solve the problem reliably.
- **AI as assistance, not authority:** generated changes remain proposals until the GM accepts them.
- **Preserve work:** reorganizing, archiving, postponing, or removing an item from a parent should not destroy it.
- **Campaigns are connected systems:** entities can be linked without forcing every relationship into one rigid hierarchy.
- **MVP over feature creep:** prove the campaign-design workflow before expanding into maps, collaboration, multiple rulesets, or VTT features.

## Current milestone

The project is entering implementation. The first engineering milestone is intentionally small and exists to prove the core architecture end to end:

```text
Sign in
  → resolve internal user
  → create Campaign
  → pin Ruleset Version
  → create Location
  → revision-safe edit
  → Archive
  → Trash
  → Restore
```

This slice validates ownership, migrations, transaction boundaries, typed campaign entities, optimistic concurrency, authorization, and lifecycle behavior before the broader campaign workflow is implemented.

## Planned MVP

The MVP is focused on turning a campaign idea into material a GM can actually prepare and run.

Core areas include:

- Campaign creation and campaign structure;
- arcs and quests / plot threads;
- NPCs, factions, and locations;
- sessions and scenes;
- encounters and rewards;
- relationships between campaign entities;
- basic timeline and continuity support;
- a deterministic fifth-edition-compatible Rules Engine based on legally reusable SRD material;
- contextual AI assistance with explicit approval boundaries;
- export-oriented structured data.

The MVP is **not** intended to be a VTT, full character builder, marketplace, multiplayer collaboration platform, native mobile app, or advanced map generator.

## Architecture

The project starts as a **modular monolith**. Module boundaries are explicit in code, but the application remains one deployable system until real operational requirements justify more infrastructure.

Initial implementation stack:

- TypeScript
- Node.js 24 LTS
- Next.js 16 App Router
- PostgreSQL 18
- Drizzle ORM / Drizzle Kit
- Zod
- pnpm
- Clerk behind a provider-neutral internal identity boundary
- Vitest
- real PostgreSQL integration tests
- Playwright

Some deliberate constraints:

- no separate backend for the first implementation slice;
- no microservices, Redis, queues, GraphQL, vector database, or event sourcing without a demonstrated requirement;
- application commands own business transactions;
- UI code does not write directly to the ORM;
- Campaign Core stays ruleset-neutral;
- external auth-provider IDs never become campaign ownership IDs;
- deterministic calculations stay outside the AI layer.

See [Architecture](docs/architecture.md) for the reasoning and boundaries behind these choices.

## Data model in one idea

Campaign entities share a common identity through `campaign_entity`, while their actual data stays in typed relational tables such as `location`, `npc`, and `quest`.

This gives heterogeneous relationships and lifecycle operations a stable target without turning the database into an EAV model.

Known structural relationships remain explicit relational structures. A generic `relationship` model is reserved for flexible semantic connections such as allies, rivals, debts, fears, protection, or custom GM-defined relationships.

See [Domain Model](docs/domain-model.md) for the conceptual model.

## AI approach

AI is a layer of the product, not the product itself.

Preferred order:

```text
Structured data → deterministic rules / algorithms → AI
```

AI output that could change campaign truth is validated and presented for review. The GM can accept, edit, reject, regenerate, or ignore it. Campaign modules do not call model SDKs directly.

## Documentation

The public documentation is intentionally concise:

- [Product](docs/product.md) — problem, users, principles, MVP boundaries;
- [Architecture](docs/architecture.md) — implementation structure and technical trade-offs;
- [Domain Model](docs/domain-model.md) — major entities, relationships, and lifecycle concepts;
- [Roadmap](docs/roadmap.md) — implementation sequence and scope boundaries;
- [Licensing](docs/licensing.md) — SRD and third-party content boundaries;
- [Architecture Decisions](docs/decisions/) — selected decisions where the trade-off is worth preserving.


## Running tests

- `pnpm test` runs the fast Node-based unit tests in `tests/unit/` without external services.
- `pnpm test:watch` watches the unit tests.
- `pnpm test:integration` runs `tests/integration/` against real PostgreSQL.

For integration tests, set `TEST_DATABASE_URL` in your shell to an existing,
dedicated test database such as `ttrpg_campaign_builder_test` (see `.env.example`).
This test setup does not load `TEST_DATABASE_URL` from local env files; set it explicitly in your shell. Missing or blank
`TEST_DATABASE_URL` causes integration tests to fail; `DATABASE_URL` is never a
fallback. The current smoke test runs `SELECT 1` through the database adapter and
closes its pool afterward. It creates no tables or migrations.

## Project status

Implementation bootstrap.

The immediate goal is to make the architecture-proof vertical slice pass against a real PostgreSQL database before expanding the schema and product surface.

## Licensing

The repository's own software license has not been selected yet.

D&D rules content is treated separately from project code. The current ruleset direction is based only on material that can legally be used from the SRD 5.2.1 under CC BY 4.0, with the required attribution and content boundaries documented in [docs/licensing.md](docs/licensing.md).
