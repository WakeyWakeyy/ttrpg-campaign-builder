# Reward planning

A Campaign can hold reusable Reward plans independently of a Session or Encounter. A plan has a title, GM notes, and individually editable components. A component records a kind and freeform description, covering money, items, information, reputation, favors, access, progression, and other narrative gains without imposing a ruleset's currency or advancement rules.

The owner can create, edit, archive, trash, and restore a plan. Components can be removed and restored without losing their descriptions. Writes check Campaign ownership and the current Reward revision; creating the shared Campaign entity and its Reward subtype is atomic. Database constraints keep each component in the same Campaign as its plan.

This is preparation only. It does not imply that anyone received a component. Reward Grants and the ledger will record what was actually awarded, to whom, and when in the next slice.
