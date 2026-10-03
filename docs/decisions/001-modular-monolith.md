# ADR 001 — Start as a modular monolith

## Context

The product has several meaningful domains — campaign content, sessions, encounters, rulesets, AI orchestration, export — but it is being built by a small team and has no demonstrated independent scaling or deployment requirement.

Splitting those domains into networked services now would add deployment, observability, failure, data-consistency, and local-development complexity before the product has proven its core workflow.

## Decision

Start with one Next.js application and one PostgreSQL database while preserving explicit module boundaries in code.

Modules are not deployable services. Dependencies between modules still follow documented direction so a later extraction remains possible if real constraints justify it.

## Consequences

Benefits:

- simpler local development and deployment;
- straightforward database transactions across related modules;
- fewer operational dependencies;
- faster product iteration;
- architectural boundaries can still be tested in code.

Trade-off:

- boundaries rely on code organization and review rather than network isolation.

## Revisit when

Reconsider service extraction only if a concrete need appears, such as independent scaling, independently deployed public APIs, materially different availability requirements, or a module whose operational profile harms the rest of the application.
