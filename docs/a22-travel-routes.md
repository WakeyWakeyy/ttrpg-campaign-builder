# A22 Travel Routes

Travel Routes connect two existing Locations in one Campaign. A route has a name and optional distance, duration, travel mode, hazards, and GM notes. Multiple routes may connect the same places, and the selected From and To locations define the route's orientation. The first slice records travel information without calculating distances or travel times.

Each route is a typed Campaign entity with revision-safe edits and Archive → Trash → Restore. Database foreign keys enforce both Location endpoints belong to the route's Campaign; route creation checks that endpoints are distinct and available. The Campaign owner is checked in application commands. Editing and creation are atomic, and stale edits are rejected.

The Campaign Workspace lists and creates routes. Each route has a detail page for changing its endpoints and travel details, or preserving it through its lifecycle. Existing routes remain when a Location is archived or trashed. A Location referenced by a route cannot be purged until the connection is explicitly resolved.

The SQL migration replays from an empty PostgreSQL schema. Integration tests cover owner isolation, typed identity, same-Campaign endpoints, atomic creation, revision conflicts, and lifecycle preservation.
