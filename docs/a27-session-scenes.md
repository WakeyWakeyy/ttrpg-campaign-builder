# A27 Session scenes

Scenes are ordered preparation beats within a Session. Each scene stores a title, optional preparation, and a separate outcome. The GM can reorder scenes by editing their order number, trash a scene, and restore it with its content intact.

Scenes are session-owned child records, not independent Campaign entities. The composite foreign key ensures a scene belongs to a Session in the same Campaign. Every command resolves the internal Actor, locks the parent Session entity, checks its expected revision, and advances that revision when scene state changes. Concurrent scene and Session edits therefore cannot silently overwrite one another. A trashed Session blocks scene changes; restoring the Session preserves its scenes. Parent purge cascades to scenes.

Integration coverage checks an empty-schema migration, ownership, same-Campaign integrity, ordering, revision conflicts, and scene recovery. The browser journey covers scene creation, outcome capture, trash, and restore.
