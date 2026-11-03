# Unsaved Navigation Protection — Phase 1

Mounted editors report only an identity and pending/uncertain flags to a shared
registry. Draft values, revisions, grant payloads and keys remain owned by the
existing editors. Unmounting or cleaning one registration never clears another.
There is no autosave or persistent/browser draft storage.

Location compares its native fields with its confirmed snapshot. Session and
Planning use their existing draft mechanisms and value comparisons; reverting
to base values removes the warning. A grant with an unconfirmed response or
request conflict stays registered even while its fields are locked. Its message
explains that leaving loses local retry details, not a committed transaction.

ActionForm participates explicitly only on Campaign workspace, Session/Run and
Blueprint/Review pages. Native comparisons include selects and checkbox groups,
including temporarily disabled controls, and exclude transport/hidden fields.
The guard never resets forms. ActionForm's existing React/native reset behavior,
including its validation limitations, remains unchanged. Only explicitly marked
departing commands confirm other drafts before dispatch: Campaign creation
commands, Start Blueprint Review, materialization and reuse preparation. Saving
the submitting form itself does not require discarding its submitted values.
Known Campaign export and Session sheet anchors explicitly use `download`, so
the browser treats attachment requests as downloads rather than document exits.

| Navigation | Actual Phase 1 coverage |
| --- | --- |
| Guarded internal Link to another page/search | Native confirmation before navigation; Cancel keeps all local values and revisions; OK navigates without saving drafts |
| Header, workspace/entity links, Session/Recap/Run and Blueprint links on selected pages | Guarded with Next Link.onNavigate |
| Same-page hash, unchanged URL, modifier/new-tab click, downloads | No custom confirmation; the current editor stays mounted |
| Marked command that leaves the editor | Confirm before original action; cancellation dispatches nothing; acceptance does not change its command or idempotency contract |
| Reload, closing a tab, external/document navigation | beforeunload listener exists only while registrations are pending; browser chooses generic text and whether to show a prompt |
| SPA browser Back/Forward | No guaranteed warning; no popstate interception, history patches or artificial entries |
| Full-document Back/Forward | beforeunload where the browser fires it |
| Router refresh / section consultation / explicit recovery | Existing behavior; no navigation confirmation or automatic discard |
| Home wizard, other entity editors, Clerk sign-out, unmarked programmatic/server redirects | Not covered by the custom Link/command guard |

Confirmations use browser-native accessible dialogs. Cancel keeps focus/navigation
in the current editor; accepting a departure does not clear registrations before
the actual unmount. beforeunload requires prior user interaction and is not
reliable for mobile process termination or browser crashes. JavaScript is required.
No draft recovery after a completed departure is promised.

Tests cover independent registry cleanup, native value comparisons, canceled and
accepted links/reload, normal history, anchors/new tabs/downloads, sibling saves,
reuse preparation, materialization before dispatch and uncertain grant retry.
PostgreSQL assertions verify canceled departures do not write and accepted
commands retain their existing effects. Hydration and concurrency regressions
remain part of validation; D02 and D09 remain separate.

References: [Next Link.onNavigate](https://nextjs.org/docs/app/api-reference/components/link#onnavigate),
[beforeunload limitations](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event).
