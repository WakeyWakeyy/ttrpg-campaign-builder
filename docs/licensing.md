# Licensing and Content Boundaries

This document records product/engineering constraints. It is not legal advice.

## Project code

A license for this repository's own source code has **not** been selected yet.

Do not add an MIT, Apache, GPL, or other project license until that choice is made intentionally. A public repository without an explicit license does not automatically grant broad reuse rights.

## D&D rules content

The initial ruleset direction is fifth-edition-compatible functionality based only on legally reusable System Reference Document material.

As of this documentation baseline, Wizards of the Coast publishes **SRD 5.2.1** under the **Creative Commons Attribution 4.0 International (CC BY 4.0)** license.

Official references:

- SRD: <https://www.dndbeyond.com/srd>
- CC BY 4.0: <https://creativecommons.org/licenses/by/4.0/>

Before shipping or redistributing SRD-derived content, use the attribution language required by the SRD itself and verify the current official guidance.

## What the SRD license does not mean

The existence of an SRD does **not** mean that all Dungeons & Dragons material is reusable.

The project must not assume permission to copy content merely because it appears in an official rulebook, adventure, website, or digital tool.

Keep separate boundaries for:

- SRD/openly licensed rules and reference content;
- original project code and original product copy;
- user-authored campaign content;
- generated content;
- third-party proprietary material.

Avoid copying official adventure prose, art, logos, protected layout/trade dress, or non-SRD rules/content into the repository or bundled product data unless a separate permission clearly covers that use.

## Compatibility language and branding

Use compatibility language only in ways supported by the current official creator guidance.

Do not imply endorsement by Wizards of the Coast or use branding in a way that makes the project appear official.

## Attribution implementation

Treat attribution as a product requirement, not a README-only afterthought.

When SRD material is bundled or exported, the implementation should be able to preserve the required source/license attribution in the appropriate product or export surface.

Ruleset records should retain provenance metadata sufficient to identify the source/version used.

## User content

Campaign content belongs to the user. Product design should keep user-authored material logically distinct from bundled rules/reference content and generated suggestions.

Import/export should preserve that distinction where practical.

## AI-generated content

Generated text is not a substitute for license review of source material.

Prompts and retrieval pipelines should avoid treating proprietary third-party text as reusable product content merely because a model can reproduce or transform it.

AI proposals should retain provenance when useful to the user or required for downstream content handling.

## Personal Rules Library — future

A future private library of user-provided rulebooks or other copyrighted material requires a dedicated design/review covering at least:

- what users may upload;
- private storage and access controls;
- processing and indexing;
- retrieval scope;
- model/provider data handling;
- generated output behavior;
- deletion and retention;
- redistribution/export boundaries.

Do not implement this feature as a generic upload-and-RAG shortcut without that review.

## Additional rulesets

Each future TTRPG system requires its own licensing review. Do not assume the D&D SRD model generalizes to another publisher or game.
