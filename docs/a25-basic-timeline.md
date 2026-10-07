# A25 Basic Timeline

Timeline Events record narratively meaningful history, not technical change history or a reconstruction of Campaign state. Each event has a title, optional description, optional real calendar date, and optional free-text in-world date. Events with real dates appear in date order; undated events follow in creation order. The in-world date is kept as written because campaigns may use fictional calendars.

An event can link to several existing Campaign entities. Each link captures the entity type and display name at the time of linking. If the linked entity is permanently purged, its live reference becomes null while the readable snapshot remains. The database enforces same-Campaign links and typed Timeline Event identity. New links cannot target trashed entities; editing an event keeps existing historical links and their original labels.

Timeline Events use the shared entity revision and Archive → Trash → Restore lifecycle. Application commands authorize Campaign ownership, validate links, and complete each operation in one transaction. The Campaign Workspace lists and creates events, and the event page supports revision-safe edits and lifecycle actions.

The versioned migration and PostgreSQL integration tests cover creation from an empty schema, owner isolation, same-Campaign link integrity, date validation, concurrent edits, lifecycle preservation, and context retained after linked-entity purge.
