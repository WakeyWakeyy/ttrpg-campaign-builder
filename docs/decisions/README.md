# Architecture Decisions

This directory contains only decisions whose trade-offs are useful to preserve for future maintainers.

These are not a chronological transcript of every project discussion. Routine implementation choices belong in code and normal documentation.

Current decisions:

1. [Start as a modular monolith](001-modular-monolith.md)
2. [Use shared Campaign entity identity with typed tables](002-shared-entity-identity.md)
3. [Enforce same-Campaign integrity in persistence](003-same-campaign-integrity.md)
4. [Keep authentication provider identity out of domain ownership](004-internal-identity.md)
5. [Use a preservation-first lifecycle](005-preservation-first-lifecycle.md)
6. [Separate Campaign Core from versioned rulesets](006-ruleset-boundary.md)
7. [Use optimistic concurrency and explicit command safety](007-concurrency-and-command-safety.md)
