# A12 Campaign Compass

Date: 2026-10-06 (America/Buenos_Aires).

The Campaign page now displays the original premise and original notes from creation. It lets the owner edit the current premise, setting, and tone. The original creative record remains unchanged, so the GM can compare the campaign's direction with the initial idea.

The application command checks internal ownership on every read and write. Edits require the rendered Compass revision. A concurrent edit increments that revision and causes an older form to show a conflict with an explicit reload control; it cannot overwrite the accepted content. The command updates the existing `campaign_compass` row, so no migration or new infrastructure is required.

This slice covers the existing core Compass fields. Guideline management (themes, boundaries, priorities, and style), the optional guided Wizard, and Blueprints remain later work.

Validation: TypeScript, lint, six unit tests, and the production build passed. A PostgreSQL integration test was added for ownership, preservation of original material, accepted edits, and stale-write rejection; it could not run locally because `TEST_DATABASE_URL` was unavailable. An authenticated browser run remains a follow-up when credentials and the test database are available.
