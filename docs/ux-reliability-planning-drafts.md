# Encounter and Reward draft recovery

Encounter definitions, individual creatures, new-creature forms, Reward plans,
individual components, new-component forms and grants retain independent native
form drafts. A related accepted write refreshes pristine sections; pending
sections keep every value and their original `expectedRevision`. Numbers remain
text until the existing application command validates them. Selects and checkbox
groups are retained along with text, including selections that become unavailable.

Validation and concurrency rejection do not reset fields. Consultation is an
authenticated, owner-scoped read. Preparation retains the entire local section
and explicitly adopts the consulted revision; **it does not merge fields**.
Saving after preparation can replace newer content in that section. A subsequent
write can still make the prepared revision obsolete. Discard affects only the
consulted section. A removed child or trashed parent cannot be prepared for an
edit; its mounted draft remains available to copy. Status commands retain their
existing meaning and do not report pending text as saved.

## Grant command identity

Planning and actual grants remain separate. A new grant retains its request key
through revalidation, consultation, validation rejection and explicit revision
preparation. The application command still authorizes the owner, locks the Reward,
checks the revision and component availability, and persists its idempotency key
and payload hash in the same transaction as the immutable ledger snapshot.

Only confirmed success clears the submitted grant and issues a new request key.
If a response is lost, grant editing/preparation/discard are disabled and the GM
can explicitly retry the **identical payload and key**, even if a later render
has a newer Reward revision. There is no automatic retry. A different-payload
idempotency rejection cannot be bypassed through ordinary revision recovery.
Consultation shows the persisted plan, not an unconfirmed grant receipt; the GM
can inspect the ledger. If an ambiguous request cannot be confirmed by an exact
retry, its fields remain retained and locked on that page.

Removing a selected component does not silently omit it from the draft or command.
The GM must explicitly revise the selection; the existing command rejects an
unavailable component. A prepared grant uses current persisted component
descriptions, which consultation displays. Pending component edits never become
part of a grant automatically.

## Boundaries and verification

Drafts exist only while their editor is mounted. Refresh, closing the tab or
navigating away is not protected. There is no autosave, browser storage, general
navigation guard, new lifecycle operation or responsive redesign. Location and
Session/Recap retain their existing implementations. NPC, Faction and Secret
defects found during diagnosis remain outside this change.

`planning-draft-*` is bounded to these planning/review editors, not a migration of
the global `ActionForm` or a universal draft store. Server Actions return success
after accepted commands and revalidate without a same-page redirect. Application
validation, ownership checks, transactions and database constraints remain
authoritative.

Unit tests cover full-field capture, checkbox groups, revision freezing, explicit
prepare/discard and ambiguous command locking. PostgreSQL integration tests cover
rejections, a second race after preparation, unchanged accepted state, concurrent
same-key retries and immutable grant snapshots. Playwright waits for confirmed
server responses and revisions, then checks both retained fields and PostgreSQL;
it also drops a response after a real grant commit and verifies a duplicate-free
retry. Location and Session/Recap suites remain regression coverage.
