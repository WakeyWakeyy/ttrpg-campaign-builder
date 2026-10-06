# Agent skills for this repository

The repository-scoped skills live under `.agents/skills/`. Codex discovers their names and short descriptions first and reads full instructions only when a task matches. `AGENTS.md` routes overlapping skills. Graphify's existing local installation remains under the ignored `.codex/skills/graphify` directory, with generated data under `graphify-out/`.

| Source | Installed skill(s) | Pinned revision |
| --- | --- | --- |
| [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | `ui-ux-pro-max` | `477bcb28c9812b385cb51a4605ddf30d7b2266e2` |
| [Impeccable](https://github.com/pbakaus/impeccable) | `impeccable` | `459438175f60feb0443165e0fd6dfb07031ac959` |
| [Vercel Agent Skills](https://github.com/vercel-labs/agent-skills) | `react-best-practices` | `063bee94c3f4df8453406c830b0a7df0f2860278` |
| [Superpowers](https://github.com/obra/superpowers) | `brainstorming`, `systematic-debugging`, `writing-plans`, `test-driven-development`, `verification-before-completion`, code review and branch workflows, plus optional coordination skills | `8ca22dba9a94f28898bbce59f2537ff4d87c747d` |

The original instruction file for each adapted skill is preserved as `UPSTREAM-SKILL.md` beside the active `SKILL.md`. Local edits shorten descriptions, fix the UI/UX Pro Max script path for Codex on Windows, and narrow broad activation rules. The Superpowers bootstrap and its two subagent workflows are explicit-only through `agents/openai.yaml`. Their files remain available for direct invocation. Other Superpowers skills can activate for a matching task.

Impeccable's Windows engine v0.1.11 is bundled under its `scripts/bin/windows-x64/` directory. Its SHA-256 is `605b5b442d2a65d270ef989de13371444849526249f511d397ca7424c184db49`, checked against the upstream `.sha256` release sidecar. This binary is specific to Windows x64; the upstream launcher handles other platforms separately.

To update, inspect upstream changes, prepare a new pinned copy, compare the active `SKILL.md` with `UPSTREAM-SKILL.md`, and carry forward only local adaptations still needed. Do not overwrite the Graphify installation or repository rules.
