# A26 Session preparation

The first Sessions slice provides a place to prepare a table session and record what actually happened. A Session has a title, optional planned calendar date, freeform preparation, and a separate outcome field. The outcome does not rewrite the plan. This makes a changed plan visible to the GM and leaves both parts available for later Run View and continuity work.

Sessions are typed Campaign entities. Creation writes the registry and typed row in one transaction. Reads and writes are owner-scoped through the internal Actor. Edits require the current revision; Archive, Trash, and Restore preserve the content and the archive state. The Campaign Workspace lists sessions and offers a creation form; each session has its own edit page.

This slice does not yet model Scenes, attendance, run state, or links to campaign entities. Those require separate product and persistence contracts. Integration coverage targets empty-schema migration, ownership, typed identity, date validation, concurrent revisions, and lifecycle preservation.
