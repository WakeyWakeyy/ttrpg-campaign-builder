# A13 Optional Campaign Wizard

Date: 2026-10-06 (America/Buenos_Aires).

Campaign creation now offers an optional three-step guide beside the direct form. The GM enters a name and original premise, can add context, then reviews every value before saving. The guide keeps entered values while moving backward and forward. It creates a Campaign through the same authenticated server action and atomic Campaign/Compass command as direct creation.

The guide does not create intermediate drafts or call AI. Closing it without submitting leaves no persisted Campaign. After submission, the existing Campaign page opens. The original premise and notes remain the original creative record; setting and tone can be edited later in the Campaign Compass.

Validation: TypeScript, lint, unit tests, and production build passed locally. The authenticated browser test now includes the guided creation path and checks the persisted Compass values. This browser path awaits an environment with Clerk test credentials and `TEST_DATABASE_URL`.

Blueprint Draft and Review, transactional materialization, and a fuller Campaign Workspace remain later roadmap work.
