# A23 Campaign Items

Items are ruleset-neutral Campaign entities for important objects. Each Item records a name, description, significance, current state, and GM notes. Its direct current locator is either one Location, one NPC holder, one Player Character holder, or unknown. A holder's own location is not copied onto the Item.

The Item subtype shares `campaign_entity` identity, revision-safe edits, and Archive → Trash → Restore. Composite foreign keys keep locators in the same Campaign, and a database check prevents multiple direct locators. Creation and edits validate that a selected locator is not in trash. Existing Items remain when their holder or Location is archived or trashed; permanent purge of a referenced locator requires resolving the Item connection first.

The Campaign Workspace lists and creates Items. Each Item has a detail page for updating its details, moving it between holders and Locations, marking its whereabouts unknown, and managing its lifecycle. All commands authorize the internal Campaign owner.

The versioned migration includes the Item table and Campaign entity type. Integration coverage checks owner isolation, typed identity, same-Campaign locators, exclusive location, revision conflicts, and lifecycle preservation.
