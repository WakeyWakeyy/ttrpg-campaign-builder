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

## Review update — 2026-10-06

PR #17 merged A10 into `main` on 2026-10-06. Its required CI run 26 passed on
commit `b1f1a11`. The PR contained the focused browser test, runner, workflow,
and documentation; it did not change the domain schema or production behavior.
The local results above cover the authenticated browser journey. At this review,
no optional `Focused browser proof` run was recorded, so the architecture-proof
exit condition remained open pending protected `e2e` environment configuration
and a successful remote browser run.

## Remote acceptance — 2026-10-06

The `e2e` GitHub environment was configured for protected branches. Its three
Clerk development credentials are stored as environment secrets, not in the
repository. The manually dispatched [Focused browser proof run 1](https://github.com/WakeyWakeyy/ttrpg-campaign-builder/actions/runs/37420021628)
completed successfully on merged `main` commit `7ad6014`. The required CI
validation also passed for [PR #18](https://github.com/WakeyWakeyy/ttrpg-campaign-builder/pull/18)
before its merge. Together with the local PostgreSQL integration evidence,
this satisfies the documented architecture-proof exit condition.

The next product slice is Campaign creation. Wizard and Blueprint remain
optional follow-on work, not implied by this checkpoint.
