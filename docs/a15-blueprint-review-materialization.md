# A15 Blueprint Review and materialization contract

Date: 2026-10-06 (America/Buenos_Aires).

## Scope and sequence

A14 is the private, pre-Campaign input draft. A15 first adds durable review decisions, then a single transactional command that creates a new Campaign from the accepted snapshot, then the browser journey. The first version supports Location proposals only. It does not import into an existing Campaign and does not call AI.

## Review model

- Each proposed Location becomes a durable node with a database-generated ID, `blueprint_id`, name, stable order, and decision: `PENDING`, `ACCEPTED`, or `REJECTED`. This table contains only Location proposals in A15.
- Promotion of the A14 `proposed_locations` array into nodes is explicit and runs once per draft. The draft's title, premise, setting, and tone remain editable with its revision check. After promotion, Location names and decisions are edited through review commands. The A14 textarea must no longer overwrite nodes.
- Review changes require `expectedRevision` for the owning draft. A successful change advances that revision; a stale command returns a visible reload conflict. A proposal ID must belong to the actor's draft. Rejection is retained as a decision, never deletion.
- The first version has no inter-node dependencies because flat Location names have no parent or reference fields. The data model and command must not infer dependencies from matching names. Before introducing parent/related proposal types, define explicit edges and validate the accepted subgraph. A rejected node cannot be implicitly accepted or recreated to satisfy an accepted dependent node; instead, review blocks the dependent acceptance or requires an explicit replacement decision.
- At materialization, `PENDING` nodes are excluded. The review page previews the exact accepted names and counts. Require at least one accepted Location only if product UX explicitly chooses that rule; a Campaign with no Locations is valid in the existing model, so zero accepted Locations is allowed.

## Materialization command

Input: owned Blueprint ID, expected draft revision, supported Ruleset Version ID, and an idempotency key. The command creates a **new** Campaign only. The name and original Compass values come from the reviewed Blueprint; each accepted Location produces one `campaign_entity` plus typed `location` pair. Rejected and pending nodes produce no Campaign rows.

The whole command owns one READ COMMITTED PostgreSQL transaction:

1. Resolve the trusted internal Actor. Claim or read a user-scoped `command_execution` row for `BLUEPRINT_MATERIALIZE`. Compare a deterministic request fingerprint; reuse of a key for another request is an error. A successful retry returns the persisted result.
2. Lock and authorize the Blueprint by internal `owner_user_id`. Check the expected revision, that review has begun, and that it was not previously materialized. Lock or read all proposal rows at the protected revision and validate names and decisions.
3. Confirm the pinned Ruleset Version exists. Insert Campaign, Ruleset pin, Compass, and only accepted registry/Location pairs using the same transaction executor. Do not call helpers that open separate transactions.
4. Persist a one-to-one Blueprint materialization record with the resulting Campaign ID and reviewed revision. The unique Blueprint key prevents a second Campaign even with a different idempotency key.
5. Mark the command execution successful with a versioned result containing Campaign ID and created Location IDs. Commit once. An error rolls back every row, including the idempotency claim.

The new Campaign is owned by the same internal user. The command never accepts a client-supplied owner or Campaign ID. Any future import into an existing Campaign needs an explicit owner check before any write and a separate command kind/fingerprint.

## User journey

Draft → Review proposals → accept, reject, or rename each node → preview accepted content → materialize → open Campaign. The review page keeps rejected and pending nodes visible, includes revision conflict/reload feedback, and disables a second materialization after success. A lost response can be retried with the same idempotency key and lands on the same Campaign.

## Required proof

- Migration from empty PostgreSQL and from an A14 database, including one-time promotion behavior.
- Ownership checks on draft reads, review commands, and materialization; guessed IDs must not reveal another user's draft.
- Stale review and materialization revisions, concurrent attempts, same-key retry, changed-fingerprint key reuse, and different-key attempt after success.
- Rollback when a later Location insert fails; no Campaign, partial Locations, materialization record, or successful command execution may remain.
- Browser journey with mixed accepted/rejected/pending Locations and a visible conflict; the resulting Campaign contains accepted Locations only.

Historical note: when this contract was drafted, A14 remained uncommitted on `feat/a13-optional-campaign-wizard`. The completed Blueprint work was later merged in PR #23.

## Local validation

On the dedicated local E2E PostgreSQL database, 120 integration tests passed, including empty-schema migration, partial acceptance, owner checks, stale revision, same-key retry, changed-fingerprint rejection, concurrent different-key attempts, and rollback on a later Location failure. Six unit tests, TypeScript, lint, Drizzle Kit `check`, and the production build passed. The authenticated Chromium/Clerk journey passed with mixed accepted and rejected proposals and verified that only the accepted Location reached Campaign truth. The Windows runner needs `%SystemRoot%\System32` on `PATH` to terminate its owned server cleanly.
