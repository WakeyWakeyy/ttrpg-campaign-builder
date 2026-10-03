# ADR 003 — Enforce same-Campaign integrity in persistence

## Context

Campaign is the ownership boundary. A Quest in Campaign A must not accidentally reference a Location, parent Quest, Faction, or other scoped entity in Campaign B.

Application-level checks help produce good errors but are not the strongest possible protection against programming mistakes or future code paths.

## Decision

First-class typed Campaign tables carry both their shared entity ID and `campaign_id`.

Where practical, structural relationships use composite same-Campaign foreign keys.

The duplicated Campaign scope is intentional: it lets PostgreSQL reject cross-Campaign corruption at the persistence layer.

## Consequences

Benefits:

- a critical tenant/ownership invariant is enforced below the UI;
- integration tests can prove the database rejects invalid cross-Campaign writes;
- future feature code inherits stronger safety by default.

Costs:

- `campaign_id` is denormalized onto typed tables;
- schema definitions and foreign keys are slightly more verbose.

The redundancy is accepted because it buys a concrete integrity guarantee rather than query convenience alone.
