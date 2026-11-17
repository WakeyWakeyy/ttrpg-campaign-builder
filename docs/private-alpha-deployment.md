# Private Alpha deployment

## Provider decision

Prices checked 2026-11-17. USD before tax, domain registration and usage beyond allowances. Budget assumes one maintainer and a small roster. Verify the plan and members before enabling billing.

| Stack | Estimated base | Fit and limits |
| --- | ---: | --- |
| Vercel Pro + Neon Free + Clerk Hobby | $20/month | Next.js 16 and Node 24, manual releases and rollback, platform protection for deployment URLs. One paid Vercel seat assumed. Runtime logs are retained for one day. Neon includes 100 CU-hours/month and 1 GB of storage per project with idle scale-to-zero. Its free restore window is limited to six hours or 1 GB of changes. Clerk includes up to 50,000 monthly retained users, a custom domain and one day of logs. |
| Render Starter + Render Postgres Basic + Clerk Hobby | About $13/month before storage/usage | Node 24 and managed PostgreSQL 18. Paid database on a Hobby workspace has a three-day PITR window. The service needs an explicit build/start setup with deploys disabled, and the app origin gate is essential on its default host. Validate PDF latency and memory on Starter. Free Render Postgres expires after 30 days and has no managed recovery. |

Use Vercel Pro, Neon Free, PostgreSQL 18 and a dedicated Clerk production instance for the first alpha if the budget is approved. Vercel Hobby costs $0 when the project qualifies as personal and non-commercial. Confirm that restriction before relying on it. The Render stack is a reasonable commercial alternative when reducing ongoing cost or increasing the database recovery window matters more than first-class Next.js and platform access controls. Neon Launch is usage-based with a published typical spend of $15/month and a configurable restore window up to seven days. Clerk documents **Invite-only** separately from its paid identifier allowlist. Confirm the production instance exposes Invite-only before onboarding. If a paid Clerk feature is needed, its published annual Pro equivalent starts at $20/month. Check the monthly checkout price before authorizing it.

Sources: [Vercel pricing and Hobby use](https://vercel.com/pricing) · [Node 24](https://vercel.com/changelog/node-js-24-lts-is-now-generally-available-for-builds-and-functions) · [Vercel runtime logs](https://vercel.com/docs/logs/runtime) · [Neon plans and recovery windows](https://neon.com/pricing) · [Neon PostgreSQL versions](https://neon.com/blog/category/changelog) · [Clerk plans](https://clerk.com/pricing) · [Clerk access modes](https://clerk.com/docs/guides/secure/restricting-access) · [Render cost example](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses) · [Render PostgreSQL versions](https://render.com/docs/postgresql-creating-connecting) · [Render backups](https://render.com/docs/postgresql-backups) · [Render rollbacks](https://render.com/docs/rollbacks)

## 1. Provision and restrict

1. After approval, create a dedicated PostgreSQL 18 database in the app's region. Use an empty database for the first alpha. Keep development, Playwright and alpha connections separate.
2. Configure a dedicated Clerk production instance with the approved domain and complete its DNS instructions. Verify **Access mode → Invite-only** and enable the invitation sign-up flow. Use Clerk's hosted Account Portal to accept invitations. Keep fallback redirects on the app origin. Verify that an uninvited browser cannot register. [Clerk production setup](https://clerk.com/docs/guides/development/deployment/production) · [Clerk access modes](https://clerk.com/docs/guides/secure/restricting-access)
3. Invite only the approved testers. After each acceptance add that instance's Clerk user ID to the app roster. A valid Clerk session alone does not grant access. Removal requires updating the roster and releasing the updated environment, plus revoking the Clerk sessions or banning the associated user while the updated roster rolls out. Check that rollback cannot restore a revoked tester. [Clerk invitation guide](https://clerk.com/docs/guides/users/inviting)
4. In Vercel, use Node 24, **Vercel Authentication → All Deployments**, and restrict Vercel access to approved users. External testers may need explicit Vercel access as well as Clerk. Keep deployment exceptions, shareable links and automation bypasses off. Configure the one canonical HTTPS host. The app rejects production previews and alternate origins. The checked-in Vercel configuration disables Git-triggered deployments and selects pnpm 12.8.1 explicitly through npm exec. Vercel's unpinned pnpm override can select pnpm 6, so confirm the pinned version in the staged build logs. [Vercel package-manager selection](https://vercel.com/docs/package-managers) Keep Preview variables empty of alpha secrets. [All Deployments protection](https://vercel.com/changelog/protect-production-deployments-for-free-on-every-plan) · [Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication) · [Git deployment settings](https://vercel.com/docs/project-configuration/git-configuration)
5. For Render, use the same canonical-origin and roster settings. Disable auto-deploy and PR previews. Select Node 24, use `npm exec --yes --package=pnpm@12.8.1 -- pnpm install --frozen-lockfile --prod=false && npm exec --yes --package=pnpm@12.8.1 -- pnpm release:build` for Build and `npm exec --yes --package=pnpm@12.8.1 -- pnpm start` for Start. Apply migrations separately before initiating a manual deploy. Verify the default host cannot reach app content. [Render deployment lifecycle](https://render.com/docs/deploys)

## 2. Environment

| Variable | Location and purpose |
| --- | --- |
| `DATABASE_URL` | Production host and operator schema check. Runtime Postgres role with TLS and normal app DML on the application schema. Pooled URL on Vercel. Give this role USAGE on the migration ledger schema and SELECT on its ledger for the release check. Set appropriate default grants for new application tables. |
| `MIGRATION_DATABASE_URL` | Operator secret store only. Direct TLS connection for the schema owner. It targets the exact same database and branch as the runtime URL. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Live keys from the single Clerk production instance. Set both in Production. Only the publishable key is client-facing. |
| `PRIVATE_ALPHA_ORIGIN` | Canonical HTTPS origin with no trailing slash. Production expects a single origin. |
| `PRIVATE_ALPHA_USER_IDS` | Server-only comma-separated Clerk user IDs. Keep the roster in Production config. |
| `TEST_DATABASE_URL`, `E2E_DATABASE_URL`, `E2E_CLERK_EMAIL` | Dedicated test environments and existing Clerk development fixtures. |

Keep secrets in provider environment settings and the operator's local secret store. Use built-in operational logs for status and timing. Restrict dashboard access and keep debug tracing, payload logging and log drains off for the alpha. Never record invitation URLs, session headers, SQL parameters, campaign data or export contents. Review the provider logs after the first smoke test. [Clerk authorized origins](https://clerk.com/docs/guides/development/deployment/production)

## 3. Backup and migrate

Before a release, record the approved Git SHA, runtime database branch, backup reference and previous compatible production deployment. Use a provider restore point plus an encrypted logical export when data must outlive the short PITR window. PostgreSQL 18 client example using local libpq service profiles and a private password file:

```sh
pg_dump --dbname=service=alpha_backup --format=custom --no-owner --no-privileges --file=alpha-release.dump
pg_restore --list alpha-release.dump
pg_restore --dbname=service=alpha_restore --no-owner --no-privileges --single-transaction --exit-on-error alpha-release.dump
```

Restore to an isolated empty PostgreSQL 18 database or a provider recovery branch. The dump must include both application tables and the Drizzle ledger. Restore grants for the runtime role, set its DATABASE_URL to the restored target, and run `pnpm db:check` plus an authenticated smoke test before switching traffic. Keep the old database available until the restored target is verified. For provider backup options see [Neon restore windows](https://neon.com/pricing) and [Render recovery](https://render.com/docs/postgresql-backups).

From the approved checkout, with the direct migration URL and the same target's restricted runtime URL installed via the secret store, run:

```sh
pnpm install --frozen-lockfile && pnpm db:migrate && pnpm release:build
```

Stop on any nonzero result. A migration failure rolls back pending changes and the release build checks connectivity, migration history, tables, columns and critical constraints before compiling. Vercel also uses this build gate. Check-only connects using the runtime role. Apply changes through this runner and keep application DDL out of the host build.

### Existing divergent databases

The original migrator compared timestamps. The timestamps of `0018` (Scene) and `0019` (attendance) are lower than `0017`. A database that upgraded incrementally can have `0017`, `0020` and `0021` recorded with both earlier migrations missing. The replacement runner executes pending SQL in journal order and records each hash and timestamp only after its DDL succeeds in the same transaction. It recognizes only these two historical holes when newer migrations are present. It accepts hashes that differ only by LF/CRLF checkout. It stops on conflicting schema objects, unknown ledger entries, hash divergence or additional gaps.

For an existing database, take a backup first. Rehearse the exact runner against a restored copy with the same ledger and schema. Accept a release only if migration, the read-only check, and the smoke all pass there. A conflicting object or unknown ledger entry requires a separate reviewed recovery plan with catalog comparison and a validated restore. Keep the original SQL, journal, and database records intact.

## 4. Stage, smoke and publish

1. Keep automatic deploys disabled. With explicit deployment approval, stage the verified SHA using the approved Vercel project and CLI version. Use `vercel deploy --prod --skip-domain` from the clean checkout and preserve the deployment ID. Keep All Deployments protection on. A protected generated URL is useful for build inspection and host-denial checks. Canonical-host authentication is verified after promotion under private platform access. [Staging and manual promotion](https://vercel.com/docs/deployments/promoting-a-deployment)
2. After explicit promotion authorization, promote the specific deployment to the approved canonical host. Verify the following before inviting the wider roster.
   - Signed out: no campaign list, actions or downloadable content. The Clerk signup flow requires an invitation.
   - Signed in but absent from the app roster: no access, including to a direct export link.
   - Invited: create a disposable test campaign, see its Workspace, open a Session and obtain its private PDF. Verify that two invited testers cannot open each other's campaign or exports by direct link. Check that the PDF has `Cache-Control: private, no-store`.
   - Unapproved Vercel user and generated or preview URL: deployment protection or app denial prevents access, even with a valid Clerk session.
   - Verify logs contain no submitted content, secrets or tokens and record results with the deployment ID.
3. For automated local smoke use the isolated Clerk-development browser setup, including the Golden Path and the optional roster smoke mode described in the browser proof. Keep production authentication interactive through the real Clerk sign-in.

## 5. Rollback

If the previous app is compatible with the current schema and access settings, roll back to that private deployment. Vercel rollbacks reuse the target's prior build and environment. Recheck the roster, domains and protection before reopening access. If the previous app is incompatible, keep access restricted and fix forward or restore to a separate database, validate and then switch connections. A database restore can discard writes made after the restore point. Record that cutoff and obtain a separate approval for the data decision. [Vercel rollback behavior](https://vercel.com/docs/instant-rollback)

## Publication checklist

- **P0** Approved provider, plan/spend, domain, tester roster and production Invite-only access. Verify preview denial and both positive and negative authenticated smoke cases.
- **P0** Back up the exact target, rehearse restore, and pass migration and release-build gates. Investigate unexpected ledger gaps or partial schemas on a copy.
- **P0** Candidate SHA passes CI and the local Golden Path on desktop and mobile. Approve staging and production promotion separately.
- **P1** Confirm budget alerts, operational log access and retention, cold-start/PDF latency, and a compatible rollback target.
- **P2** PDF relationship-arrow fallback and longer observability or backup retention if alpha usage warrants them.
