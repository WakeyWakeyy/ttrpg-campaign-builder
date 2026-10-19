# Session sheet PDF

This deterministic PDF layout is a temporary delivery solution, consistent with the campaign PDF. Future versions will likely obtain editorial output through an AI API. That possibility does not introduce a provider dependency now: the authorized Session snapshot stays separate from rendering, and any future generated material must preserve GM control and the distinction between preparation and recorded outcomes.

Each Session offers a private A4 PDF at `sheet?format=pdf`, alongside its existing Markdown download. It gathers the campaign and session names, planned date, previous Session and Scene outcomes, recorded attendance, current preparation, ordered Scenes, and available Encounter placement titles. Encounter statistics and current-session outcomes are outside this preparation sheet.

Both formats use `buildSessionSheet`: an owner-authorized, repeatable-read snapshot. Trashed Scenes and placements with unavailable Encounter definitions are omitted. Archived or trashed Sessions remain readable by their owner, matching the existing Markdown download. Unrecorded attendance and an explicitly empty attendance list remain distinct. The renderer starts after the read transaction completes and never writes to Campaign truth.

The PDF uses the same restricted pdfmake runtime and embedded Roboto fonts as the campaign module, with no browser or external resources. Authored notes remain literal, including Markdown-looking headings, HTML, and resource references. Fixed section headings and scene titles guide reading without a separate table of contents. Long notes flow over pages; headings avoid being stranded at the bottom. Every page has a GM-only footer and page numbers. Latin accents, Greek, and Cyrillic are supported; CJK and emoji coverage are not promised.

The route authenticates before snapshot collection, returns identical 404 responses for missing and foreign Sessions, and sends an attachment with `private, no-store` and `nosniff`. Unknown formats return 404. The PDF renderer loads only for PDF requests.

Unit tests cover the document model, literal notes, empty state, encounter placement, real multipage generation with embedded fonts, response headers, authentication, and missing/foreign Session responses. Existing PostgreSQL integration tests cover the shared snapshot's ownership and availability filtering. Visual checks cover short and multipage documents, Unicode text, final scenes, and page footers.

Quick-reference PDF layouts, player-safe publishing, and custom typography remain later work.
