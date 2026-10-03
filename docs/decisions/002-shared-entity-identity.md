# ADR 002 — Shared Campaign entity identity with typed tables

## Context

Many campaign concepts need to participate in cross-cutting features: semantic relationships, Timeline links, knowledge, provenance, Archive/Trash/Restore, and optimistic concurrency.

Using a separate unrelated primary-key space for every entity makes heterogeneous references awkward. Using one generic EAV/JSON entity table would make domain data weakly typed and harder to constrain.

## Decision

Use a shared `campaign_entity` registry for the identity and cross-cutting metadata of first-class Campaign entities.

Keep actual domain fields in typed relational tables such as `location`, `npc`, `quest`, and `encounter` using a shared-primary-key pattern.

```text
campaign_entity
  id = E1
  entity_type = NPC

npc
  id = E1
  name = ...
```

Registry row + typed row creation is one atomic operation.

## Consequences

Benefits:

- heterogeneous links target a real foreign key;
- lifecycle and revision state have one common surface;
- domain data remains typed and relational;
- semantic relationships do not require polymorphic string IDs.

Costs:

- subtype integrity becomes an explicit invariant;
- first-class entity creation touches at least two tables;
- migrations/tests must prevent orphan or mismatched subtype rows.

## Rejected alternative

A generic EAV or giant JSON Campaign-entity table was rejected because important campaign structure should remain queryable, constrained, and understandable in the relational schema.
