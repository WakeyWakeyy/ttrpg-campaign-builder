# A20 Player Characters and Parties

Date: 2026-10-06 (America/Buenos_Aires).

Player Characters are lightweight, ruleset-neutral Campaign entities. Each records a character name, optional player name, description, and current state. The model deliberately excludes character sheets and mechanical class or level fields; those belong behind the Ruleset boundary when needed.

A Party is an independent Campaign entity with a name, optional description, and explicit Player Character memberships. Membership is normal group composition, not session attendance. Multiple Parties can exist in a Campaign. Removing a membership preserves the PC, and Archive, Trash, and Restore preserve the Party and its composition.

Both types share `campaign_entity` identity and preservation lifecycle. Composite foreign keys enforce typed identity and same-Campaign membership. Commands authorize the internal Campaign owner, require expected revisions for edits, serialize Party composition changes at the Campaign row, and reject stale writes. The Campaign Workspace lists and creates PCs and Parties; detail pages edit their content and lifecycle. The Party page shows and edits members.

The migration replays from empty PostgreSQL schemas. Integration tests cover ownership, atomic creation, subtype and Campaign constraints, revisions, concurrent Party edits, membership preservation, and lifecycle. Validation also includes unit tests, TypeScript, lint, build, and Drizzle Kit checks.
