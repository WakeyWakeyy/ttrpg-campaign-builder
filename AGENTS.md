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
The shared operating guide is `docs/graphify-workflow.md`.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- Before relying on a result, check snapshot coverage and freshness, then verify the cited relationship in its source file. If the graph is missing, stale, or incomplete for the question, inspect the source directly and state the limitation.
- For new entities or cross-module changes, use the relevant subgraph to inspect dependencies against the accepted architecture. Review whether new node and relationship patterns are represented after updating the snapshot; `graphify update .` alone does not change Graphify's extraction model. See `docs/graphify-workflow.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Contextual skills

The project skills live in `.agents/skills/`. Load a skill for the requested task, not as a permanent instruction bundle. This file's architecture, authorization, lifecycle, and test constraints remain authoritative for project work. If a skill proposes a broader workflow or dependency, follow the narrower project scope unless the user explicitly asks to expand it.

- `ui-ux-pro-max`: use for UI/UX pattern research, interaction, and accessibility. Its searchable data supports decisions; check recommendations against the current interface and product intent.
- `impeccable`: use for explicit visual direction, critique, redesign, or focused polish/audit. For ordinary UI edits, use its narrow relevant guidance only. Preserve the existing design and behavior when the task is a refinement.
- When both design skills apply, use UI/UX Pro Max to research patterns and Impeccable to evaluate and refine the resulting interface. Do not run two parallel design-system generators or create `PRODUCT.md`/`DESIGN.md` merely because a skill is installed.
- `react-best-practices`: use the relevant rules for React/Next.js implementation and performance. The local Next.js version guide above controls version-specific APIs; do not apply a generic rule that conflicts with it.
- Superpowers skills: select a specific process skill for planning, debugging, testing, review, or verification when it fits the task. Its conversation-wide bootstrap is explicit-only. Subagent workflows require the user's explicit request. Existing repository practices and user instructions take priority over skill defaults such as mandatory brainstorming, test-first work, new worktrees, or review for every change.
- Graphify remains the existing `.codex/skills/graphify` plus hook and `graphify-out/` integration. Keep using the Graphify section above; do not install another copy.

The upstream skill versions and local adaptations are recorded in `docs/agent-skills.md`. No application feature is authorized by installing a skill.
