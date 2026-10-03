# ADR 006 — Separate Campaign Core from versioned rulesets

## Context

The first ruleset is fifth-edition-compatible, but most campaign concepts — NPCs, locations, quests, factions, clues, sessions, relationships — are not inherently D&D concepts.

Hardcoding D&D mechanics into Campaign Core would make future rulesets expensive and would mix narrative state with reference/mechanical data.

Rules also change over time. Existing Campaigns must not silently change their mechanical interpretation because the application updates its reference data.

## Decision

Keep Campaign Core ruleset-neutral.

Ruleset-specific definitions and deterministic calculations live behind a Ruleset Adapter boundary.

A Campaign pins an immutable published Ruleset Version. Updating the application or publishing another Ruleset Version does not silently migrate an existing Campaign.

## Consequences

Benefits:

- narrative Campaign data is not shaped around one game's mechanics;
- deterministic rules remain testable independently of AI;
- Campaign behavior is reproducible against its pinned version;
- additional systems have a defined extension boundary.

Costs:

- rules-specific features require explicit adapter contracts;
- some product features need a clean split between generic entity state and ruleset extension data.

Cross-ruleset Campaign conversion is intentionally outside the MVP.
