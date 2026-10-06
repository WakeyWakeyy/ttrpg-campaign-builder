# A18 Campaign Quests

Date: 2026-10-06 (America/Buenos_Aires).

Quests are independent Campaign entities for goals and plot threads. They have a name, description, and an outcome status: Open, Resolved, Failed, Postponed, or Abandoned. A Quest may have one parent Quest and may belong to any number of Arcs in the same Campaign. Detaching a Quest or changing its status preserves its children and Arc associations until those links are explicitly edited.

The `quest` typed table shares identity and lifecycle fields with `campaign_entity`. Composite foreign keys enforce subtype and same-Campaign integrity for Quests, parent links, and Arc membership. The application serializes hierarchy edits at the Campaign row, rejects cycles, scopes reads and writes to the internal owner, and requires an expected revision for changes. Archive, Trash, and Restore preserve status, hierarchy, memberships, and prior archive state.

The Campaign Workspace lists Quests and offers creation. The Quest page edits content, status, parent, and Arc membership, with a visible stale-write conflict. PostgreSQL migration replay and 129 integration tests passed from empty schemas. Six unit tests, TypeScript, lint, production build, and Drizzle Kit checks passed.
