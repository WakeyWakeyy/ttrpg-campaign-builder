# A14 Blueprint Draft

Date: 2026-10-06 (America/Buenos_Aires).

The first Blueprint Draft slice is complete. A signed-in GM can create a private, pre-Campaign draft with a title, premise, optional setting and tone, and up to 20 proposed Location names. Drafts appear on the dashboard and can be reopened and edited. No draft creates or changes a Campaign or Location.

The new `blueprint_draft` table belongs to an internal `user_account`, not a Clerk subject or Campaign. The Blueprints application boundary checks ownership on reads and writes. Edits require `expectedRevision`; stale edits return a visible conflict with an explicit reload. The PostgreSQL migration adds nonblank title/premise, positive revision, and JSON-array shape constraints. The application validates proposed Location names and count before persistence.

Validation on the dedicated local E2E database: 6 unit tests, 117 real-PostgreSQL integration tests, TypeScript, lint, production build, and the authenticated Chromium/Clerk test passed. The browser test verifies draft ownership, proposed locations, accepted edit, and stale-write rejection alongside the earlier campaign journey. Drizzle Kit `check` passed and `generate` reported no schema changes after the migration and snapshot were added. The migration was also exercised from an empty schema by the integration and browser suites.

Next: Blueprint Review and partial acceptance. Define individually addressable proposal nodes and rejection semantics before materialization. The current `proposed_locations` string array is only a draft input shape; do not turn it directly into Campaign Locations without an explicit review and transactional materialization command. Review should preserve rejected nodes and must not recreate them through dependencies. Materialization needs persisted idempotency and Campaign ownership checks per the architecture decisions.
