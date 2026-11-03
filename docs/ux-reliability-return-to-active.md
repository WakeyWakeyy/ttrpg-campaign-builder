# D02 Phase 1 — Return to Active

Location, Session, Encounter and Reward now expose explicit Unarchive through
their existing lifecycle commands. Clue and Secret provided the reference
behavior; their existing commands remain unchanged.

| Current state | Unarchive with the current revision |
| --- | --- |
| Archived, not in Trash | Clear only archivedAt; advance revision and updatedAt once |
| Active | No writes or timestamp/revision changes |
| Trash, whether archived or not | No-op; Restore must happen first |

Ownership, typed identity and revision validation run before no-op detection,
under the existing transaction and entity lock. A stale revision is rejected even
when the entity is already Active or in Trash. No schema, migration, dependency,
retention or idempotency change is needed. Archive over Trash retains its existing
behavior; this phase does not normalize it.

Restore clears deletion/retention fields and preserves the previous archive
state. Thus Archived → Trash → Restore returns Archived. Return to active is a
separate, explicit choice. It does not reactivate descendants, removed scenes,
creatures or components, change relationships, alter preparation/outcomes, or
rewrite grants and history.

The button is visible only when archived and not in Trash. It uses formNoValidate
and retains the current pending/conflict/hydration restrictions. The existing
adapters pass only identity and expectedRevision for this intent; pending text
is not validated or saved. Feedback confirms a status operation only after the
command resolves and explicitly states that draft content was not saved.
Local values remain in their current editors. Dirty related forms keep their
original base revision and require the existing consultation/preparation or
discard decision before a later write. An uncertain grant stays locked with its
original payload/key; parent reactivation does not resolve or replace its retry.

PostgreSQL tests cover ownership, invalid identities/revisions, exact timestamp
preservation on no-ops, concurrency, Restore, related rows and immutable grant
snapshots. Browser tests cover both lifecycle paths, browser-invalid local text,
pending child sections, and retrying a committed grant after a remote
Archive/Unarchive. Hydration, conflict recovery and D04 remain regressions.

## D02 Phase 2 — explicitly pending

Ten archivable entity types still lack Return to active: **Arc, Quest, NPC,
Player Character, Party, Faction, Travel Route, Item, Relationship and Timeline
Event**. Their revision-keyed ActionForms and draft/reset limitations are not
changed here. Phase 1 does not claim to complete D02 for these types.

Clue and Secret already support Unarchive. Campaign has lifecycle columns but no
equivalent public lifecycle commands in this scope. Scene, Creature and Reward
Component support removal/restoration rather than their own Archive state.
Blueprint review/materialization is a different workflow. No narrative state,
navigation behavior, D09 fix or universal form infrastructure is introduced.
