# A17 Campaign Arcs

Date: 2026-10-06 (America/Buenos_Aires).

Campaign Core begins with Arc, a broad story grouping owned by a Campaign. A GM can create an Arc, edit its name and description, and Archive, Trash, or Restore it from the Campaign Workspace. Arc edits require the current revision and surface a reload conflict for stale tabs. This slice does not create Quest relationships; Arcs and Quests remain independent until Quest support exists.

The `arc` typed table shares its ID with `campaign_entity`. The registry now permits `ARC` and `LOCATION`, and both typed tables use a composite `(campaign_id, id, entity_type)` foreign key. PostgreSQL therefore rejects cross-Campaign links and subtype mismatches. Creation of the registry and Arc row is atomic. Existing Location rows receive the fixed `LOCATION` discriminator during migration.

The migration runs from an empty PostgreSQL schema and over pre-A17 data. All 125 PostgreSQL integration tests passed, including ownership, subtype agreement, rollback, revision conflicts, no-op edits, and lifecycle preservation. Six unit tests, TypeScript, lint, production build, and Drizzle Kit checks passed. The authenticated Chromium/Clerk journey covers Arc creation and stale edit alongside the existing Campaign and Location flow.
