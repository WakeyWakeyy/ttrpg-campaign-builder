# A21 Campaign Factions

Date: 2026-10-06 (America/Buenos_Aires).

Factions are ruleset-neutral Campaign entities for organizations and collective actors. A Faction records its name, description, purpose, and current state. It shares the `campaign_entity` identity, revision protection, and Archive → Trash → Restore lifecycle.

NPCs and Player Characters can belong to a Faction through explicit membership records. Each record retains an optional role and rank and can be marked active or former. Changing a membership never deletes the character. Returning a former member to active updates the same record. The first slice records current and former affiliation, not a dated sequence of multiple terms.

Composite foreign keys enforce the correct Faction subtype and same-Campaign character membership. Application commands authorize the internal Campaign owner and serialize Faction edits and membership changes using its revision. The Campaign Workspace lists and creates Factions; the Faction page edits details, lifecycle, and memberships.

The migration replays from an empty PostgreSQL schema. Integration tests cover ownership, atomic creation, subtype and Campaign constraints, stale concurrent writes, membership status, and lifecycle preservation.
