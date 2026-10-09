# Encounter Builder

An Encounter is a first-class Campaign entity with a title and GM notes. The initial builder supports combat plans for Campaigns pinned to SRD 5.2.1. Rules-specific party level, party size, creature XP, and quantity live in separate SRD tables; the Encounter identity remains ruleset-neutral. Each named creature group can be edited, removed, or restored. The encounter itself supports revision-safe edits and Archive, Trash, and Restore.

The builder calculates the XP total from available creature groups and compares it with the pinned version's low, moderate, and high budgets. Creature XP is entered by the GM from a stat block. The calculator does not infer challenge rating or predict the outcome of play.

Definitions are independent of Sessions and Scenes. A placement links the same definition to a Session or one of its Scenes; multiple placements are allowed. Removing a placement does not delete the definition. Copying Session preparation carries placements for the Session and its available Scenes, but not their run history. Discarding a Session cannot delete an Encounter definition. The [Encounter Run history](encounter-run-history.md) records what happened without changing the reusable plan.
