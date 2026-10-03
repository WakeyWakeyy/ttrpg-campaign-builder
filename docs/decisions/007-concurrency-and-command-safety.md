# ADR 007 — Optimistic concurrency and explicit command safety

## Context

Campaign content can be edited from multiple tabs and will eventually be targeted by generated proposals and multi-row workflows.

Silent last-write-wins behavior can erase newer GM work. At the same time, global edit locks would add friction and complexity to a primarily single-owner MVP.

Some high-impact commands also need to survive safe retries after network failures without duplicating their effects.

## Decision

Use optimistic concurrency for protected Campaign-entity edits.

Commands carry `expectedRevision`; updates only succeed when the stored revision still matches. A mismatch returns a conflict instead of overwriting newer state.

Use persisted idempotency for high-impact retryable multi-row commands such as Blueprint materialization, AI Proposal acceptance, Campaign import, and future bulk generation.

The whole use case owns one transaction. Internal helpers must not independently commit inside that operation.

## Consequences

Benefits:

- stale tabs and stale AI proposals cannot silently overwrite newer GM decisions;
- normal editing needs no long-lived lock service;
- retryable high-impact operations can be safe after ambiguous network outcomes;
- transaction failure semantics remain explicit.

Costs:

- callers must handle conflicts as a normal application result;
- high-impact commands require idempotency-key design and persistence;
- tests must cover race/conflict paths, not only happy paths.
