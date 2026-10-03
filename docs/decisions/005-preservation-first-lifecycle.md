# ADR 005 — Use a preservation-first lifecycle

## Context

Campaign building is long-lived creative work. GMs constantly reorganize ideas, postpone plans, replace structures, and revisit previously discarded material.

Treating every removal as hard deletion would make the application hostile to experimentation and make accidental loss too easy.

## Decision

Separate four concepts:

- Active;
- Archived;
- Trash;
- permanent Purge.

Archive is reversible and does not schedule destruction.

Moving an entity to Trash records deletion and a retention deadline (initial design: 30 days). Restore clears deletion state while preserving any previous archive state.

Permanent purge is explicit. Reorganization, unlinking, scrapping, failing, abandoning, or moving an entity does not imply deletion.

## Consequences

Benefits:

- accidental deletion is recoverable;
- campaign reorganization can be non-destructive;
- archive and deletion express different user intent;
- historical workflows can keep readable references when live objects later disappear.

Costs:

- queries need clear default lifecycle filters;
- purge and Campaign-level deletion require careful transactional behavior;
- retention adds maintenance work later.

The added lifecycle complexity is justified because preservation is part of the product's core trust model.
