# TTRPG Campaign Builder

A campaign design and preparation application for tabletop RPG Game Masters.

**Status:** architecture proof complete through A10 · A11 Campaign creation dashboard complete · A12 Campaign Compass reading and editing complete · A13 optional Campaign Wizard in progress · **Core stack:** TypeScript, Next.js, PostgreSQL, Drizzle

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

The architecture proof is complete through A10. A11 adds the Campaign creation dashboard, A12 adds Campaign Compass reading and revision-safe editing, and A13 adds an optional guided creation path. See the [roadmap](docs/roadmap.md) and [A13 progress](docs/a13-campaign-wizard.md) for the current scope.

## Earlier architecture milestone

The persistence and technical safety foundation through A5 is complete, including Campaigns, a shared entity registry, typed Locations, and Technical Operation Safety. A6 — Authentication / Actor Boundary, A7 — Campaign application boundary, and A8 — Location application commands + revision/lifecycle behavior are complete. The next implementation slice is **minimal UI + Playwright proof**. The full architecture-proof vertical slice remains in progress:

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

Completing this milestone will validate ownership, migrations, transaction boundaries, typed campaign entities, optimistic concurrency, authorization, and lifecycle behavior before the broader campaign workflow is implemented.

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
- Playwright (planned)

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

Campaign entities share a common identity through `campaign_entity`, while their actual data stays in typed relational tables. The registry and `location` are implemented; `npc` and `quest` are planned.

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

### Minimal browser UI (A9)

For Next.js, `DATABASE_URL` and the Clerk keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
and `CLERK_SECRET_KEY`) may live in `.env.local`.

Before applying the existing migrations, make `DATABASE_URL` available to
drizzle-kit. `drizzle.config.ts` uses `dotenv/config`, which does not load
Next.js's `.env.local`. For example, set it in the PowerShell session:

```powershell
$env:DATABASE_URL="postgresql://app:local_password@localhost:5432/ttrpg_campaign_builder"
pnpm db:migrate
```

Then run `pnpm dev`. No new migration or additional dependency is needed for A9.

`/` offers Clerk sign-in, the owner's Campaign list, and Campaign creation from
a name and original premise. The server resolves the persisted `dnd-5e-2024`
Ruleset Version `5.2.1`; a missing seed produces an unavailable message.
`/campaigns/[campaignId]` lists all Location lifecycle states and offers creation.
`/locations/[locationId]` provides editing, Archive, Trash, and Restore.
The Clerk user menu includes identity and sign-out controls.

Server Components and Server Actions resolve `requireActor(db)` before calling
the existing application boundaries. A lazy process-wide database pool serves
requests. The only form client state is pending/error feedback; accepted commands
revalidate and redirect to persisted server state. Location forms submit the
rendered revision. A conflict disables further submissions until explicit reload,
without fetching a new revision and silently retrying. Archive/Trash/Restore
semantics remain in the A8 commands; no Unarchive is exposed.

Manual smoke checklist with configured Clerk credentials:

1. Sign in; create a Campaign with a name and original premise; return home and
   verify it appears in the list, then open it.
2. Create a Location, edit its name/description, save, and reload to verify it persisted.
3. Archive it, then Trash it, then Restore it. Verify it remains **Archived** in
   both the Location detail and Campaign list.
4. Open the same Location in two tabs. Save a change in one; submit the older
   form in the other. Verify the visible conflict message and Reload control,
   and verify the first tab's accepted content was not overwritten.
5. Sign out through the user menu; verify the signed-out entry is shown.

Browser automation remains the separate A10 checkpoint.

### Authentication boundary (A6)

Server transports call `requireActor(db)` from
`src/infrastructure/auth/clerk/require-actor.ts` before entering feature code.
It awaits Clerk authentication and resolves `(provider, provider_subject)` through
the Identity application boundary to an `Actor` containing only the internal
`user_account.id` as `userId`. Missing authentication throws `UnauthenticatedError`
with code `UNAUTHENTICATED`; infrastructure errors propagate separately.

The identity resolver owns account/mapping creation in one transaction. The
existing unique index chooses the winner of concurrent first resolutions; losing
transactions roll back their accounts and then read the committed mapping.
Call it with the database before starting a feature command transaction. Provider
claims must come from the trusted auth adapter, never from submitted form data.

Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in `.env.local`
to serve authenticated requests. `src/proxy.ts` installs the Clerk request
context on Next.js 16; it does not implement Campaign authorization or sign-in UI.
Unit tests mock Clerk and the build does not require live Clerk credentials.
The lockfile resolves Clerk 7.9.10 and Next.js 16.3.8, which satisfies Clerk's
published Next.js peer range; no Next.js dependency adjustment was needed.
See the [Clerk proxy documentation](https://clerk.com/docs/reference/nextjs/clerk-middleware).

### Test commands

- `pnpm test` runs the fast Node-based unit tests in `tests/unit/` without external services.
- `pnpm test:watch` watches the unit tests.
- `pnpm test:integration` runs `tests/integration/` against real PostgreSQL.

For integration tests, set `TEST_DATABASE_URL` in your shell to an existing,
dedicated test database such as `ttrpg_campaign_builder_test` (see `.env.example`).
This test setup does not load `TEST_DATABASE_URL` from local env files; set it explicitly in your shell. Missing or blank
`TEST_DATABASE_URL` causes integration tests to fail; `DATABASE_URL` is never a
fallback. Before running the suite, apply the committed migrations with
`pnpm db:migrate`, setting `DATABASE_URL` to the dedicated test database for that
command.

The suite covers identity, Ruleset and Campaign persistence, ownership, Ruleset
Version pinning, Campaign Compass, the shared entity registry, Location integrity,
revision-safe SQL updates, and archive/trash/restore database behavior. It also
replays committed migrations from an empty schema and checks upgrades with existing
data. Integration tests require PostgreSQL 18.

## Project status

Completed persistence, technical safety, and tooling foundation (through A5):

- app bootstrap, PostgreSQL 18, and Drizzle migrations;
- unit tests and real PostgreSQL integration tests;
- provider-neutral identity persistence;
- Ruleset / immutable Ruleset Version foundation;
- Campaign root persistence, internal-user ownership, and Ruleset Version pinning;
- Campaign Compass persistence and Campaign archive/trash database invariants;
- shared `campaign_entity` registry and typed Location persistence, with same-Campaign constraints and database tests for atomic creation, revision safety, and lifecycle behavior;
- Technical Operation Safety persistence foundation;
- CI validation and protected `main`.

A6 — Authentication / Actor Boundary is complete: Clerk authentication resolves to an internal Actor through the provider-neutral identity boundary.

A7 is complete: owner-scoped Campaign queries and atomic Campaign creation with a Ruleset Version pin and Compass.

A8 is complete: `src/modules/locations` exposes owner-scoped `listOwnedLocations`
and `getOwnedLocation`, atomic `createLocation`, revision-safe `editLocation`, and
`archiveLocation`, `trashLocation`, `restoreLocation`. Every function takes the
database and trusted internal Actor. Listing and creation take a Campaign ID;
direct access takes a Location ID. Queries include all lifecycle states.
Edits take `expectedRevision` in their input; lifecycle commands take it as the
fourth argument. Omitted edit fields stay unchanged; nullable fields accept `null`.
Missing, malformed and non-owned direct IDs share `LocationNotFoundError`.
Invalid input, parent hierarchy and stale revisions have distinct typed errors.

Parent changes serialize on the owning Campaign row and validate ancestor links
after acquiring that lock. Ordinary content edits lock only the entity. Real edits
and lifecycle transitions increment revision once and update the timestamp;
current-revision no-ops write nothing, and stale no-ops still conflict. Trash keeps
archive state and an exact 30-day UTC retention window; repeated Trash never
restarts it. Restore clears deletion fields and preserves archive state.

Next: **minimal UI + Playwright proof**. Campaign UI, remaining Campaign commands,
and end-to-end browser flows are still pending. The completed application boundary
is not yet an end-to-end Campaign workflow.

## Licensing

The repository's own software license has not been selected yet.

D&D rules content is treated separately from project code. The current ruleset direction is based only on material that can legally be used from the SRD 5.2.1 under CC BY 4.0, with the required attribution and content boundaries documented in [docs/licensing.md](docs/licensing.md).
