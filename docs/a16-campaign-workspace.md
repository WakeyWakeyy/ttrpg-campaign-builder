# A16 Campaign Workspace shell

Date: 2026-10-06 (America/Buenos_Aires).

The Campaign page now gives the GM one place to see the Campaign status, a count of active, archived, and trashed Locations, the original and current Compass, and the Location list and creation form. Section links work as direct URL anchors, including on small screens. Existing edit and lifecycle commands remain the source of truth; this slice adds no database model or speculative controls for future modules.

The authenticated Chromium/Clerk journey checks section navigation, the empty Location state, and the absence of horizontal overflow at a 390px viewport before following the existing Campaign and Location workflow. TypeScript, lint, and production build passed locally.

The next roadmap area is Campaign Core. Add its first new entity through the established registry, typed table, ownership, and revision boundaries before showing it in the workspace.
