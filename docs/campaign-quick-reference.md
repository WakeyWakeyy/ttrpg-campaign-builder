# Campaign quick-reference sheets

The Campaign workspace offers a private Markdown download at `export/quick-reference`. It uses the same owner-authorized, repeatable-read snapshot as the other campaign exports and performs no writes.

The sheets group available NPCs, Player Characters, Parties, Factions, Locations, Travel Routes, and Items. Entries link to their source records and show the relevant recorded role, player, current state, party members, purpose, parent Location, route endpoints and travel details, or item significance and current holder. Long descriptions, preparation, outcomes, and historical ledgers stay in the detailed module. No prose or game mechanics are generated.

Archived, trashed, and unregistered entities are omitted. References to unavailable parents, endpoints, and holders say “Unavailable record” without exposing their names; unavailable Party members are omitted. Empty campaigns show an explicit empty state. Labels are flattened to one line and Markdown formatting characters are escaped.

This is a GM reference and may contain private information. It is not player-safe publishing. The campaign overview and focused session sheet remain separate downloads; PDF remains the next export step.

Unit tests cover content, links, lifecycle filtering for both entries and their references, empty campaigns, multiline labels, and snapshot preservation. Shared PostgreSQL integration tests cover authorization and campaign isolation at the snapshot boundary.
