# TTRPG Campaign Builder

A workspace for tabletop RPG Game Masters to develop a campaign idea into connected material they can prepare and use at the table.

> **North Star:** I still feel like I created this campaign, but I had an entire team helping me prepare it.

## Why this project exists

Campaign preparation often ends up scattered across notes, wikis, spreadsheets, rulebooks, PDFs, and AI chats. The challenge is keeping ideas connected and consistent as the campaign changes, while making them easy to find during play.

TTRPG Campaign Builder follows the campaign from an initial idea through its world, story threads, sessions, and consequences. The GM remains the author and makes the final decisions. The application helps organize material and preserve earlier work as plans evolve.

## What works today

- **Start a campaign:** sign in, create a campaign directly or use a guided idea-to-campaign flow, and record its premise, setting, and tone.
- **Build a connected world:** create and manage arcs, quests, NPCs, player characters, parties, factions, locations, travel routes, and important items.
- **Track connections and history:** link campaign elements with meaningful relationships and place events on a timeline.
- **Prepare sessions:** record a session plan and its outcome separately, then arrange scenes in the order you expect to run them. Scenes also keep preparation and outcomes separate. Reuse a plan in a new session when plans change.
- **Consult rules and build encounters:** open selected sections of the SRD 5.2.1 with source attribution, calculate XP budgets, save a combat Encounter plan with creature groups, place it in Sessions or Scenes, and record what happened during play.
- **Plan and record rewards:** prepare reusable packages for treasure, information, favors, and other gains, then record actual grants in a historical ledger.
- **Keep control of changes:** edit with conflict protection and archive, discard, or restore supported campaign material without silently losing accepted work.
- **Review continuity:** see prompts for an open or postponed Quest beneath a closed parent, timeline dates that may need review, or a clue without an available recorded discovery Location. The GM decides whether any case needs attention.
- **Review story threads:** see open, postponed, and abandoned Quests together, with links back to each record.
- **Keep hidden information connected:** record GM-authored Secrets and optionally link discoverable Clues to them without implying that any character knows the truth.
- **Recall what happened:** read recorded Session and Scene outcomes together, with links back to each source record.

These features are backed by persistent storage and automated tests. The current interface is a working foundation for campaign preparation, with more of the play-at-the-table workflow still to come.

## Milestones reached

1. **Working foundation:** authentication, campaign ownership, durable storage, and safeguards for concurrent edits and recovery.
2. **Campaign creation:** direct creation, a guided starting flow, reviewable draft material, and a central campaign workspace.
3. **Campaign core:** story structure, people and groups, places and travel, items, relationships, and a basic timeline.
4. **Session preparation:** sessions and ordered scenes with separate plans and outcomes.
5. **Rules foundation:** a versioned SRD reference index and deterministic encounter XP budgets.

The detailed implementation history is in the [roadmap](docs/roadmap.md).

## Estimated project status

**Active development — campaign creation, the connected campaign core, session preparation, rules reference, Encounters, Reward Grants, initial continuity prompts, a thread review, a source-linked outcome summary, and GM-authored Secrets are implemented.** Clues can link to Secrets; knowledge states remain ahead. This is an estimate of product maturity, not a release percentage or delivery date. Broader contextual assistance and export remain on the roadmap.

The project is not yet a complete tool for running a campaign end to end. It is also not intended to become a virtual tabletop, full character builder, marketplace, or multiplayer platform in its initial scope.

## Product principles

- **GM first:** important narrative decisions are never changed silently.
- **Connected material:** campaign elements can relate to one another without being forced into one rigid hierarchy.
- **Preserve work:** changing plans, reorganizing, or removing an item from view should not destroy it unexpectedly.
- **Reliable tools first:** structured information and deterministic rules take priority where they solve a problem well.
- **AI as assistance:** generated changes should be reviewable proposals that the GM can accept, edit, or reject.

## Technology and documentation

The application uses TypeScript, Next.js, PostgreSQL, Drizzle, and Clerk. It is built as one application with clear internal boundaries. For technical details, see [Architecture](docs/architecture.md) and [Domain Model](docs/domain-model.md).

- [Product vision](docs/product.md)
- [Roadmap](docs/roadmap.md)
- [Licensing and rules content](docs/licensing.md)
- [Architecture decisions](docs/decisions/)

## Local development

Use Node.js 24, pnpm 12, and PostgreSQL 18. Copy the settings described in [.env.example](.env.example), including the database URL and Clerk keys. Set `DATABASE_URL` in your shell before running migrations; the migration tool does not load Next.js's `.env.local` automatically.

```powershell
pnpm install
$env:DATABASE_URL="postgresql://app:local_password@localhost:5432/ttrpg_campaign_builder"
pnpm db:migrate
pnpm dev
```

Run `pnpm test` for unit tests. Integration tests use a dedicated PostgreSQL database: set `TEST_DATABASE_URL`, migrate that database with `DATABASE_URL` pointed to it, then run `pnpm test:integration`. Browser tests run with `pnpm test:e2e` after configuring their test environment; see [browser proof setup](docs/browser-proof.md).

## Licensing

A license for the repository's own software has not yet been selected. Rules content is handled separately: the current direction uses legally reusable SRD 5.2.1 material under CC BY 4.0. See [licensing details](docs/licensing.md).
