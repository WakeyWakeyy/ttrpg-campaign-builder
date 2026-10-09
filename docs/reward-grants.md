# Reward Grants and ledger

A GM records a grant from an available Reward plan by selecting the components actually given, naming the recipient, and optionally attaching a Session and notes. The grant date is recorded by the server. The recipient is a freeform name so the ledger can describe a character, party, or other beneficiary without changing campaign membership.

Each grant belongs to the Campaign and stores a copy of the plan title and selected component kinds and descriptions. Later plan edits do not rewrite the ledger. A source Reward or Session link can be removed without removing the grant snapshot. Recording is atomic, owner-scoped, checks the Reward revision and component availability, and uses a request key so a retried submission returns the original grant. Reusing a key with different details is rejected.

The ledger is append-only for this slice. Grant correction or reversal and ruleset-specific currency or advancement accounting remain later decisions.
