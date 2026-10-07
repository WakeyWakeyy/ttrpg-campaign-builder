# Local Graphify workflow

Graphify is a local aid for finding code relationships. Its outputs live in the Git-ignored `graphify-out/` directory, so each checkout maintains its own snapshot. The installed skill at `.codex/skills/graphify/SKILL.md` supplies the detailed build and update procedure. Graphify is not part of the application runtime or required CI.

## Keep a usable snapshot

Work from the repository root. Check for `graphify-out/graph.json` and `graphify-out/manifest.json`. If either is missing, use the installed Graphify skill to build the snapshot before querying it. After source changes, run `graphify update .`; after a documentation-only change, update only if that document belongs to the indexed corpus. Do not treat a successful update as proof of complete coverage.

`graphify update .` refreshes indexed data; it does not by itself change which kinds of nodes and relationships Graphify knows how to represent. When a new first-class entity, module boundary, or relationship pattern is introduced, check after the update whether its source files, nodes, and expected links appear. If files are indexed but the representation is missing or misleading, record the gap and review Graphify's extraction rules as a separate tooling change. Do not invent nodes or treat a graph-model gap as an application defect.

Before using a result for a decision, compare the relevant source files with `graphify-out/manifest.json`: note changed files and files absent from the manifest. The manifest records the indexed corpus; it does not guarantee that every repository file or behavior is represented. If coverage or freshness is uncertain, inspect the relevant source directly and report the limitation. Keep generated output local; do not commit `graphify-out/` or the local `.codex/` installation.

## Query and verify

1. Start with `graphify query "<question>"` to find concepts and source files. Rephrase using terms present in the graph if a query misses the target.
2. Use `graphify explain "<concept>"` for one concept, or `graphify path "<A>" "<B>"` to inspect a proposed relationship. Disambiguate repeated symbols with `path::symbol` when needed.
3. Prefer scoped results. Use `graphify-out/wiki/index.md` for broad navigation when present; read `graphify-out/GRAPH_REPORT.md` for broad architecture review or when focused queries are insufficient.
4. Open the original code, migration, or test before stating a behavior or changing an accepted contract. An `EXTRACTED` edge is derived evidence that still needs source verification; an `INFERRED` edge is a hypothesis. A missing node does not prove that a feature is absent.

If the command fails, output is truncated, or the relevant files are missing or outdated in the manifest, continue with direct source inspection. In the answer, name the files checked and distinguish verified behavior from graph suggestions and remaining uncertainty. Code, migrations, and executable tests take precedence for implemented behavior; accepted documentation defines intended contracts. Do not use node or edge counts as proof of completeness.

## Review development direction

Before implementing a new Campaign entity or changing authorization, lifecycle, transactions, or module boundaries, query the relevant subgraph. Trace the proposed change to its callers, data model, and tests; compare the observed dependencies with `AGENTS.md`, `docs/architecture.md`, and the applicable decisions. A surprising edge is a lead for source inspection, not a verdict. If verified code diverges from an accepted boundary, state the discrepancy and decide explicitly whether the current task should correct it or record it for later. Repeat the focused review after a substantial cross-module change so new dependencies are visible. Do not use the snapshot alone to claim architectural compliance.
