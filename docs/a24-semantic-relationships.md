# A24 Semantic Relationships

Relationships are GM-defined, directed links between two first-class Campaign entities. Each link records a short type (for example, “protects” or “owes”) and optional details. The type is data, so a new meaning does not require a migration. Reverse links are separate; cycles and repeated semantics are allowed. Structural connections such as party membership, travel routes, and quest hierarchy retain their explicit models.

The relationship has its own shared `campaign_entity` identity, revision, and Archive → Trash → Restore lifecycle. The database enforces that both endpoints belong to the same Campaign. Creation and editing reject endpoints in trash and require an authenticated owner. Endpoint deletion cannot silently remove a relationship; the GM must resolve the link first.

The Campaign Workspace lists and creates links across Locations, Arcs, Quests, NPCs, Player Characters, Parties, Factions, Travel Routes, and Items. The relationship page supports revision-safe edits and lifecycle actions.

The versioned migration and PostgreSQL integration tests cover typed identity, same-Campaign foreign keys, owner isolation, duplicate semantics, opposite directions, revision conflicts, and preservation.
