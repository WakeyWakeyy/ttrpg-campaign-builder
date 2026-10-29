# Blueprint Review proposal drafts

Each proposal keeps its native name and decision controls, local values and
original Blueprint `expectedRevision` independently. Saving another proposal
does not reset a pending name or decision. Validation and concurrency rejections
retain both fields. Successful proposal decisions return a confirmed result and
revalidate the review without redirecting back to the same page.

Consultation authorizes the Blueprint owner and resolves the proposal only within
that Blueprint. Preparing uses the consulted revision while retaining every local
field; it does not merge names or creative decisions. A newer write still causes
a conflict. Discard replaces only that proposal's draft. If the Blueprint has
already been materialized, consultation marks the proposal unavailable for
preparation; mounted controls retain values for comparison/copying.

Campaign preview and materialization use **persisted accepted proposals only**.
Neither preparing a draft nor selecting Accept locally accepts a proposal. The
materialization command, revision check, transaction and persisted idempotency
contract are unchanged. Explicit Campaign creation still navigates away: pending
proposal recovery does not introduce a navigation guard or autosave.

This slice reuses the bounded `PlanningDraftForm` from the preceding Encounter /
Reward PR. It does not add draft storage or migrate other forms. Drafts last only
while the editor is mounted; reload/close/navigation can discard them. It does
not cover the earlier Blueprint premise editor or change lifecycle, responsive
layout, Location, Session/Recap, NPC, Faction or Secret.

Unit tests cover owner/proposal scoping, materialized recovery, retained creative
choices and success/error timing. PostgreSQL tests exercise failed validation,
obsolete revisions, a second race after preparation, no accidental acceptance,
and the existing materialization/idempotency contract. Playwright waits for the
real response and revision before checking independent drafts, validation,
consult/prepare/discard, another race, and materialization with an unsaved local
acceptance. Only the persisted proposal becomes a Campaign Location.
