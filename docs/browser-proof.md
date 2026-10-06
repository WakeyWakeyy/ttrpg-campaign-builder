# A10 focused browser proof

The existing UI is exercised in Chromium: Clerk sign-in, internal Actor resolution,
Campaign creation and reopening, Location creation/editing, a rejected stale write
from a second tab, and Archive → Trash → Restore retaining the archive timestamp.
Browser assertions are supplemented by database checks for internal ownership,
unchanged revision/content after conflict, and restored lifecycle metadata.
No production authentication bypass is introduced.

## Local setup

Use Node 24, the repository's pnpm version, and PostgreSQL 18. Create a dedicated
test database whose name contains a `test` or `e2e` underscore-delimited segment.
The database role needs permission to create schemas. Never use a development or
production database. Copy the following into ignored `.env.e2e.local`:

```dotenv
E2E_DATABASE_URL=postgresql://app:local_password@localhost:5432/campaign_e2e
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
E2E_CLERK_EMAIL=campaign+clerk_test@example.com
```

Prefer an existing dedicated test user in the same Clerk development instance.
The [official Clerk Playwright helpers](https://clerk.com/docs/guides/development/testing/playwright/test-helpers)
provide `clerkSetup`, testing tokens and `clerk.signIn({ emailAddress })`.
This authenticates through Clerk's supported backend-token strategy; it does not
test the modal's password/MFA screens. No password or saved browser session is needed.
`+clerk_test` addresses suppress email delivery. Do not commit credentials.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:e2e
```

The runner owns a Next development server at localhost:3100 and refuses to reuse
another server. Explicit environment variables override `.env.e2e.local` and the
server's DATABASE_URL overrides Next's `.env.local`. One worker and no retries keep
this focused journey deterministic. Each invocation creates a random `a10_...`
schema, applies the committed migrations there (including Ruleset seeds), and
sets the same search path for the server and assertions. Teardown drops only that
validated schema, including all created Actors/Campaigns/Locations. Setup errors
after schema creation also clean up. A force-killed process can leave an orphan
schema; inspect and remove only that run's `a10_` schema in the dedicated database.
The existing Clerk test user is retained; no external users are created/deleted.

Traces, screenshots and videos are disabled; auth storage state is never written.
Playwright output directories are ignored. Do not upload session-bearing browser
artifacts or environment files when diagnosing a failure.

## CI policy

The existing required `validate` job remains independent of Clerk credentials.
`Focused browser proof` is an explicit `workflow_dispatch` workflow using the `e2e`
GitHub environment and its three Clerk/email secrets listed above. The environment
is limited to protected branches; its first [remote run](https://github.com/WakeyWakeyy/ttrpg-campaign-builder/actions/runs/37420021628)
passed on `main` on 2026-10-06. Dispatch only
reviewed code: tests execute with development Clerk credentials. No secrets are
exposed to fork pull requests and no browser artifacts are uploaded. This optional
external-service proof must pass before claiming A10 acceptance; a green `validate`
job alone does not prove A10. Rerun the browser workflow after changes to this
journey or its Clerk integration.

On Windows, ensure `%SystemRoot%\System32` is on PATH so Playwright can
terminate its owned server with `taskkill`. A missing system-tools PATH caused
the first local run to hang after teardown; restoring PATH resolved it.
