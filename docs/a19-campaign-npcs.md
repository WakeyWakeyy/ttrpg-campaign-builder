# A19 Campaign NPCs

Date: 2026-10-06 (America/Buenos_Aires).

NPCs are independent, ruleset-neutral Campaign entities controlled by the GM. The first slice records a name, optional description, role, and current state. It deliberately leaves faction memberships, location presence, relationships, and session participation for their own Campaign Core slices; those features can refer to the NPC without owning its identity or lifecycle.

The `npc` typed table shares identity and preservation lifecycle with `campaign_entity`. A composite foreign key enforces the correct subtype and same-Campaign identity. Creation is atomic. Application commands require an internal owner for reads and writes, and changes require an expected revision. Archive, Trash, and Restore preserve the NPC's details and prior archive state.

The Campaign Workspace lists and creates NPCs. Each NPC has an edit page with a visible stale-write conflict and lifecycle actions. PostgreSQL migration replay and 132 integration tests passed from empty schemas. Six unit tests, TypeScript, lint, and production build passed.
