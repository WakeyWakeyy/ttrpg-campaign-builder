# Engineering Guidelines for Coding Agents

This file defines implementation constraints for coding agents working in this repository. It is intentionally short. Product intent lives in `docs/product.md`; technical reasoning lives in `docs/architecture.md` and `docs/decisions/`.

## General rule

Implement the requested slice without broadening scope. Prefer the smallest change that preserves the documented invariants.

Do not redesign accepted boundaries as part of an unrelated task. If implementation evidence exposes a conflict, describe it before introducing a new architectural dependency.

## Architecture

- Keep the application a modular monolith.
- Do not introduce a separate backend unless an independent deployment/API requirement exists.
- Do not introduce microservices, Redis, queues, GraphQL, a vector database, event sourcing, CQRS, Kubernetes, or other infrastructure without a demonstrated requirement.
- Server Actions and Route Handlers are transport adapters, not the home of authoritative business logic.
- Application commands/services own validation, authorization, and transaction orchestration.
- Do not create repository/service classes mechanically for every table. Add abstractions when they encapsulate meaningful behavior or reusable query boundaries.

## Module direction

- Campaign Core must remain ruleset-neutral.
- Campaign Core must not depend on Blueprints, Intelligence/AI, or Export.
- Ruleset-specific mechanics go through the Ruleset boundary.
- Feature modules must not call LLM SDKs directly.
- Provider-specific code belongs behind infrastructure adapters.

## Identity and authorization

- Domain ownership uses internal `user_account` IDs.
- Never persist Clerk/provider user IDs as Campaign ownership keys.
- Resolve the authenticated provider identity to an internal Actor before entering feature logic.
- Every Campaign-scoped write must authorize access in the application layer.
- Do not rely on the UI to enforce authorization.

## Database

- PostgreSQL is the source of truth.
- Use Drizzle schema definitions plus reviewed, versioned SQL migrations.
- Do not use schema push as the production migration strategy.
- Known structural relationships should remain relational; do not replace them with generic JSON or generic relationship rows.
- First-class Campaign entities use the shared `campaign_entity` identity plus a typed table.
- Preserve same-Campaign integrity with database constraints wherever practical.
- Creation of a registry row and its typed subtype must be atomic.

## Transactions and concurrency

- The complete use case owns the transaction.
- Internal helpers may receive an existing transaction/executor; they must not commit independent nested transactions inside a larger operation.
- Entity edits that use revision protection require `expectedRevision` and must reject stale writes.
- Do not silently overwrite a newer accepted state.
- High-impact retryable multi-row commands require persisted idempotency when specified by the architecture.

## Lifecycle

- Archive, Trash, Restore, and Purge are different operations.
- Archive is reversible and does not schedule deletion.
- Trash is recoverable during its retention period.
- Restore must preserve prior archive state.
- Reorganization or unlinking must not imply deletion.
- Permanent purge must be explicit and must not silently delete other first-class Campaign entities.

## Rules and AI

- Prefer deterministic rules/algorithms over model calls whenever possible.
- AI-generated changes to Campaign truth are proposals until explicitly accepted.
- Validate structured AI output before persistence.
- Keep original GM-authored content accessible when AI summaries or transformations are shown.

## Testing

- Test database invariants against real PostgreSQL, not an in-memory substitute.
- Add deterministic tests for rules calculations and pure state transitions.
- Add integration tests for migrations, constraints, transactions, concurrency, authorization boundaries, lifecycle behavior, and idempotency.
- Keep browser E2E tests focused on high-value user journeys.
- A schema change is incomplete until migrations work from an empty database.

## Current implementation scope

The first architecture-proof slice is:

```text
Sign in
  → internal user
  → Campaign
  → pinned Ruleset Version
  → Location
  → revision-safe edit
  → Archive
  → Trash
  → Restore
```

Do not implement later Campaign Wizard, Blueprint, AI, export, encounter, or map features unless the task explicitly moves into those areas.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
