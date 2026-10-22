# A10 focused browser proof

The existing UI is exercised in Chromium: Clerk sign-in, internal Actor resolution,
Campaign creation and reopening, Location creation/editing, a rejected stale write
from a second tab, and Archive → Trash → Restore retaining the archive timestamp.
Browser assertions are supplemented by database checks for internal ownership,
unchanged revision/content after conflict, and restored lifecycle metadata.
No production authentication bypass is introduced.

The same local authenticated journey now also covers A13 guided Campaign creation
and A14 Blueprint Draft creation, internal owner persistence, proposed Location
names, accepted editing, and rejection of a stale draft edit. See the
[roadmap](roadmap.md) for later completed journeys.

## Location draft preservation and conflict recovery

The Location editor submits native, uncontrolled fields through an explicit
client submit handler. It does not use a React form action, so a resolved
validation/conflict result does not reset the inputs. Only Location uses this
path; the shared ActionForm and other editors are unchanged.

Validation errors keep all entered values. A stale revision keeps the draft
editable and copyable while blocking mutations. View persisted version performs
an authenticated, owner-scoped read and displays a snapshot separately; it does
not change the draft or its expectedRevision. Keep draft and use this revision
explicitly prepares another edit, which still requires Save and can conflict
again. Preparation does not merge persisted changes into the draft. The GM must
compare both fields and incorporate wanted changes manually: Save submits the
draft's name and description and may replace newer content. Use persisted
version (discard draft) explicitly replaces the fields.
Trashed snapshots cannot be prepared for editing; load the persisted version
before using Restore. Restore continues to preserve the prior archive state.
Archive and Trash do not save pending name/description edits. Their success
message states that only status changed; local text is retained in this page.

Success feedback follows a confirmed command/transaction result. Failed or
unconfirmed requests retain the draft and never show success. There are no
automatic retries, autosave, browser-storage drafts, schema changes, or new
dependencies. This editor requires client hydration; a full reload, closing the
tab, or leaving the page can still discard local input. Navigation protection
and preservation across sections remain separate work.

Run `pnpm test:e2e -- tests/e2e/location-draft.spec.ts` for the focused journeys:
server validation and correction, two-tab conflict/recovery with an intervening
write, explicit discard with Archive/Trash/Restore, Archive/Trash with pending
text, and transport failure. These
assert field values and persisted rows/revisions, not only error messages.
Unit tests cover recovery transitions and action completion/error handling;
the Location PostgreSQL integration suite covers read-only consultation,
authorization, invalid edits, and stale writes during explicit recovery.

## Session and Recap independent drafts (D07)

Session details, existing scenes, Add scene, Session outcome and Scene outcome
use a Session-specific native form wrapper with stable entity/section identity.
Each section keeps its own field values and base revision in mounted client
memory. There is no universal draft provider and Location remains unchanged.

Saving a section returns explicit success only after its command completes,
then revalidates the affected pages without a same-page redirect. Pristine
sections adopt fresh server values/revisions. Pending sections retain every
field (including untouched fields) and their original expectedRevision. A new
shared Session revision makes these drafts stale; it never silently rebases
them or changes to per-Scene concurrency. PostgreSQL commands, locks, transaction
boundaries and authorization are unchanged.

View persisted values for this section is an owner/session-scoped read. It does
not save, replace values, or adopt the revision. The GM can explicitly retain
the draft against that snapshot or discard only that section's draft. Retaining
does not merge: wanted changes must be incorporated manually before Save, which
can still conflict with an intervening writer. Recap submits outcome only;
preparation remains separate. Scene creation resets only its own fields after
confirmation. Lifecycle success does not clear pending text or claim to save it.

Trashed scenes stay rendered read-only in Recap so a pending outcome remains
copyable after revalidation. Unavailable snapshots cannot be prepared for a new
write. Add scene likewise stays read-only when its Session is trashed. Restore
is still performed through the existing edit-page controls.

Recovery is limited to mounted Session/Recap editors: leaving the page, closing
the tab or a full reload can lose drafts. Reuse preparation intentionally opens
a different Session. Attendance and encounter-selection forms retain their
existing behavior; their same-page saves still preserve the text drafts covered
here. No autosave, browser storage, navigation guard, migrations, dependencies,
Run View redesign or D09 fix is included.

`tests/e2e/session-drafts.spec.ts` covers both cross-form journeys in both
directions, stale recovery with a second writer, server validation, untouched
fields during remote refresh, scene creation drafts and unavailable scene
outcomes. Assertions wait for the successful response and fresh revision before
checking retained values; PostgreSQL assertions distinguish local drafts from
accepted content. Unit tests cover section transitions and recovery reads;
integration tests exercise stale parent/scene writes and explicit recovery
against real PostgreSQL. The existing Session journey remains a regression check.

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
