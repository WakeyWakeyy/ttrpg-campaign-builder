# A10 validation and continuation

Date: 2026-10-05 (America/Buenos_Aires). Baseline: a11a47c.
Branch: feat/a10-browser-proof.

Local and remote main were verified at the recorded baseline, with a clean
working tree before implementation. A1-A9 exist; A10 was still pending.

## Actual validation

- Unit tests: 6 passed across 2 files.
- PostgreSQL integration tests: 114 passed across 9 files.
- Chromium journey: 1 passed, including internal Actor ownership, Campaign
  reopening, stale-edit rejection across two tabs, and Archive/Trash/Restore.
- Type checking and lint: passed.
- Production build: passed.
- Initial browser run exposed an ambiguous alert selector (Next route announcer);
  the assertion now scopes to main. No product-code change was needed.
- Windows runner initially lacked System32 on PATH; Playwright teardown hung
  after database cleanup. Restoring system-tool discovery fixed process cleanup.

The browser uses a fresh schema in the explicitly selected test database, with
committed migrations and seeds. No authentication bypass, new domain entities,
or schema migrations were added. Clerk credentials/email stay in ignored local
configuration; no traces, screenshots, videos or saved sessions are committed.

## CI and next step

See [browser proof](browser-proof.md) for credentials and CI setup. The required
validate job is unchanged. The optional manually dispatched browser workflow
requires the e2e GitHub environment and Clerk secrets; it has not been run in CI.

Next: review this branch's real diff, complete the established PR/validate flow,
and then reassess architecture-proof completion. Do not start Wave B, Wizard,
Blueprint or broader product work implicitly. Local evidence is not remote CI
evidence, and an unmerged branch is not a completed release.
