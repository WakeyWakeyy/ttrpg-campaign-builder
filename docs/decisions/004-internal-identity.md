# ADR 004 — Keep authentication provider identity out of domain ownership

## Context

The MVP uses Clerk for authentication, but Campaign ownership is a durable domain relationship. Storing Clerk subjects directly as ownership keys would couple campaign data to one infrastructure provider.

## Decision

Create an internal `user_account` identity and map external providers through `auth_identity(provider, provider_subject)`.

Campaigns reference `user_account.id`, never the raw Clerk subject.

Application feature code receives an internal authenticated Actor after identity resolution.

## Consequences

Benefits:

- replacing or adding an auth provider does not rewrite Campaign foreign keys;
- provider-specific code stays at the infrastructure boundary;
- authorization logic works with stable application identity.

Cost:

- sign-in resolution requires one additional mapping step/table.

That cost is small compared with coupling durable ownership data to a provider identifier.
