# A11 Campaign start — implementation progress

Date: 2026-10-06 (America/Buenos_Aires).

The architecture proof is complete as recorded in [A10 validation](a10-validation.md). A11 starts the first product-facing creation slice using the existing Campaign and Campaign Compass persistence. The dashboard groups owned campaigns into active, archived, and trashed sections. Creation captures a required name and original premise plus optional description, setting, tone, and original notes. The existing application command persists all fields atomically with the pinned Ruleset Version and internal owner identity.

This increment does not add a schema migration or change the authorization boundary. The guided Wizard, Compass reading/editing, Blueprint Draft and Review, materialization, and expanded Campaign Workspace remain pending. The dashboard links to the existing Campaign detail screen in every lifecycle state; Campaign lifecycle actions are not part of A11.

Validation on 2026-10-06: TypeScript and lint passed; 6 unit tests passed; the production build passed. The existing PostgreSQL and authenticated browser proofs cover the underlying campaign creation command, but do not specifically exercise the new optional form fields or dashboard grouping. Add focused browser coverage when the Campaign creation journey is expanded.
