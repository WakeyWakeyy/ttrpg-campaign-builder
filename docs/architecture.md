# Architecture

## Goals

The architecture is optimized for a small team and an early product:

- ship a coherent MVP quickly;
- keep important domain boundaries visible;
- make data integrity testable;
- avoid infrastructure that is not yet justified;
- keep Campaign Core independent from D&D-specific mechanics and AI providers;
- preserve a path for later growth without pretending the project already needs distributed systems.

The default question is not “what architecture could this eventually need?” but “what is the simplest architecture that safely supports the next product slice?”

## Initial stack

- **Language:** TypeScript
- **Runtime:** Node.js 24 LTS
- **Web:** Next.js 16 App Router
- **Database:** PostgreSQL 18
- **ORM / migrations:** Drizzle ORM + Drizzle Kit + reviewed SQL migrations
- **Validation:** Zod
- **Package manager:** pnpm
- **Authentication:** Clerk initially, behind an internal identity boundary
- **Unit / integration tests:** Vitest
- **Database integration:** real PostgreSQL
- **Browser E2E:** Playwright

Hosting, object storage, background-job infrastructure, observability vendor, LLM provider mix, and PDF renderer remain implementation choices to make when their requirements become concrete.

## Deployment shape

The application starts as one Next.js-hosted **modular monolith**.

```text
Browser
   │
   ▼
Next.js UI / transport
   │
   ▼
Application commands
   │
   ├── Identity
   ├── Campaigns
   ├── Campaign Core
   ├── Knowledge
   ├── Sessions
   ├── Encounters
   ├── Rewards
   ├── Timeline
   ├── Rulesets
   └── Operations
          │
          ▼
Persistence / provider adapters
          │
          ▼
PostgreSQL / external providers
```

Blueprints, Intelligence/AI, and Export are orchestration-oriented modules that sit outside the core dependency direction.

These boundaries are code boundaries, not deployable services.

## Layering

The intended flow for a write is:

```text
UI / Route / Server Action
        │
        ▼
input validation + authenticated Actor
        │
        ▼
application command
        │
        ├── authorization
        ├── domain / use-case validation
        ├── transaction boundary
        └── orchestration
                │
                ▼
        persistence / provider adapters
```

Transport code should stay thin. It can parse inputs and translate application errors into UI behavior, but it should not become the only place where authorization or invariants exist.

The project intentionally avoids creating a repository class and service class for every database table. Abstractions should exist when they protect behavior or meaning, not to satisfy a template.

## Module boundaries

### Identity

Maps external authentication identities to the application's internal user identity and produces the authenticated Actor used by feature code.

### Campaigns

Owns Campaign creation, ownership, lifecycle, and ruleset pinning at the Campaign root.

### Campaign Core

Owns ruleset-neutral narrative/world entities and their structural/semantic connections.

### Knowledge

Owns secrets, clues, and which campaign entities know or suspect information.

### Sessions

Owns preparation and session-level organization, including attendance overrides and optional scenes.

### Encounters

Owns reusable Encounter definitions, placements in preparation, and records of actual Encounter runs.

### Rewards

Owns planned rewards, reward components, and grants representing what was actually received.

### Timeline

Owns narratively meaningful campaign history. It is not an audit log or event-sourcing system.

### Rulesets

Owns ruleset versions, deterministic rules interfaces, and rules-specific reference/mechanical data.

### Operations

Owns technical safety mechanisms such as selected change sets and high-impact command idempotency.

### Blueprints

Owns pre-Campaign structured drafts and transactional materialization into Campaign truth.

### Intelligence

Owns AI/provider orchestration, contextual analysis, and proposals. Core modules do not depend on it.

### Export

Owns portable/editorial representations. Core modules do not depend on it.

## Dependency direction

The most important dependency rule is:

```text
Core product state must not depend on optional orchestration layers.
```

In practice:

- Campaign Core does not depend on Intelligence, Blueprints, or Export;
- Campaign Core does not contain D&D-specific fields simply because the first adapter is D&D;
- feature modules do not call Clerk or LLM SDKs directly;
- infrastructure adapters can depend inward on application contracts, not the reverse.

## Identity and ownership

Authentication-provider identity is not application ownership identity.

The application stores an internal `user_account` and maps provider subjects through `auth_identity`.

```text
Clerk subject
     │
     ▼
auth_identity
     │
     ▼
user_account
     │
     ▼
campaign.owner_user_id
```

This avoids making Campaign foreign keys depend on Clerk. A provider migration should require changing the identity adapter/mapping, not rewriting campaign ownership.

The initial implementation uses one owner per Campaign. Collaboration and workspace membership are intentionally deferred.

Authorization is explicit in application commands. The first version does not rely on PostgreSQL row-level security.

## Persistence model

### Database-generated identifiers

PostgreSQL 18 owns primary ID generation through native `uuidv7()` defaults.
Existing identifiers are preserved when defaults change; application code does not
generate primary IDs. A2 changes the A1 UUIDv4 defaults in a new migration.

### Campaign as ownership boundary

Every first-class Campaign entity belongs to exactly one Campaign. Cross-Campaign structural and semantic links are invalid in the initial implementation.

### Shared entity identity + typed tables

First-class Campaign objects use a common `campaign_entity` registry for shared identity and lifecycle data while keeping domain fields in normal typed tables.

```text
campaign_entity
  id = E1
  campaign_id = C1
  entity_type = LOCATION
  revision = 4

location
  id = E1
  campaign_id = C1
  name = "Old Lighthouse"
```

This is not an EAV model. Typed tables keep typed columns and constraints.

The shared identity gives heterogeneous relationships, knowledge links, timeline links, provenance, lifecycle, and concurrency a stable target.

### Same-Campaign integrity

Typed first-class tables carry `campaign_id` as well as the shared entity ID. Structural links use same-Campaign composite foreign keys where practical.

The duplication is intentional: persistence should be able to reject cross-Campaign corruption rather than trusting every caller to remember the scope rule.

### Explicit structures stay explicit

Known relationships such as Quest hierarchy, Arc↔Quest, Location hierarchy, faction membership, session attendance, travel routes, encounter placement, reward grants, and clue links are modeled explicitly.

A generic `relationship` entity is reserved for flexible GM-defined semantics.

### JSON is not campaign storage by default

JSON/JSONB is useful for intentionally variable or technical payloads such as Blueprint drafts, AI proposals, change snapshots, import/export payloads, or frozen execution context.

Stable Campaign entities and known relationships should not collapse into giant JSON documents.

## Lifecycle and preservation

Archive and deletion are separate dimensions.

```text
if deleted_at != null → Trash
else if archived_at != null → Archived
else → Active
```

Archive hides an entity from normal active views but does not schedule destruction.

Trash is recoverable for a retention period (initial design: 30 days). Restore clears deletion state but does not clear a previous archive state.

Permanent purge is explicit. Purging a first-class entity must not silently cascade-delete other first-class Campaign entities.

This model allows the application to support long-lived creative work without making ordinary reorganization destructive.

## Transactions

Transaction ownership belongs to the **complete use case**.

If a command creates or changes multiple rows that together represent one operation, those writes share one PostgreSQL transaction.

Internal persistence helpers may accept the current transaction/executor. They must not silently open and commit independent nested transactions inside a larger operation.

This keeps failure behavior understandable without adding a custom Unit of Work framework.

## Concurrency

First-class Campaign entities use a monotonically increasing `revision` for optimistic concurrency.

Edit commands carry the revision the user edited:

```text
UPDATE ...
WHERE id = ? AND revision = expectedRevision
```

If no row is updated, the command reports a conflict instead of overwriting newer accepted state.

Long-lived edit locks are not part of the initial implementation.

The same revision mechanism also provides stale-state protection for future AI proposals and high-impact operations.

## Command idempotency

Not every write needs an idempotency record.

High-impact multi-row operations that may safely be retried after network or provider failures do. Examples include:

- Blueprint materialization;
- AI Proposal acceptance;
- Campaign import;
- future bulk/generative operations.

A persisted command execution boundary prevents a successful operation from being applied twice because the HTTP response was lost.

## Ruleset boundary

Campaign Core stores campaign meaning. Ruleset adapters provide deterministic mechanics and reference data.

Campaigns pin an immutable published Ruleset Version. A later application or rules update must not silently recalculate an established Campaign under a different version.

Cross-ruleset Campaign conversion is outside the MVP.

A2 stores Rulesets, their published Versions, and per-Version content source
metadata in relational tables. Stable Ruleset keys and scoped Version/source keys
support lookup without environment-specific UUIDs. Restrictive foreign keys prevent
deleting referenced global metadata. The unique `(ruleset_id, id)` Version index
lets A3 enforce Ruleset/Version agreement using a composite foreign key.

Published Versions have no application mutation path. Immutability is a command
boundary contract; A2 adds no UPDATE-blocking or automatic `updated_at` triggers.
Publication dates are nullable for sources whose dates are unknown.

## AI boundary

Campaign feature modules do not call LLM SDKs directly.

The Intelligence layer selects relevant context and calls an AI provider adapter. Structured outputs are validated before they can become proposals.

Meaningful generated updates remain outside Campaign truth until accepted. Multi-target proposals are rejected as stale if any required target revision no longer matches rather than partially applying against mixed state.

Correctness must not depend on AI availability.

## Migrations

Production schema evolution is migration-driven:

```text
change Drizzle schema
  → generate migration
  → inspect SQL
  → add explicit SQL when required
  → run from empty PostgreSQL
  → run integration tests
  → commit
```

Schema push is not the production migration strategy.

Early lifecycle/status values that are expected to evolve generally prefer `text + CHECK` over PostgreSQL ENUMs.

## Test strategy

### Unit tests

Use for deterministic rules calculations, schema validation, pure hierarchy/cycle logic, state transitions, and portable transforms.

### PostgreSQL integration tests

Use real PostgreSQL for behavior that depends on PostgreSQL:

- migrations from an empty database;
- composite foreign keys;
- same-Campaign rejection;
- subtype creation rollback;
- optimistic concurrency;
- Archive / Trash / Restore metadata;
- high-impact transaction rollback;
- idempotency boundaries.

A mocked ORM or in-memory database is not evidence that those constraints work.

### Browser E2E

Playwright covers a small number of high-value journeys. E2E tests complement database integration tests rather than replacing them.

## First architecture-proof slice

Implementation starts with:

```text
Sign in
  → resolve/create internal user
  → list Campaigns
  → create Campaign + pin Ruleset Version
  → create Location
  → edit Location with expected revision
  → Archive Location
  → move Location to Trash
  → Restore Location
```

This is intentionally smaller than the first major product workflow. It proves the integrity of the write path before dozens of Campaign Core tables depend on it.

## Deliberately deferred

The following are not part of the architecture by default:

- separate backend service;
- microservices;
- GraphQL;
- Redis;
- queue infrastructure;
- vector database;
- graph database;
- CQRS;
- event sourcing;
- Kubernetes;
- PostgreSQL RLS;
- speculative object storage abstractions.

Any of them can be introduced later if a measured product or operational requirement makes the added complexity worthwhile.
