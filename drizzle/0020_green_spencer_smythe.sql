CREATE TABLE "ruleset_reference" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"source_id" uuid NOT NULL,
	"key" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"page" integer NOT NULL,
	CONSTRAINT "ruleset_reference_page_positive" CHECK ("ruleset_reference"."page" > 0)
);
--> statement-breakpoint
ALTER TABLE "ruleset_reference" ADD CONSTRAINT "ruleset_reference_source_id_ruleset_content_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."ruleset_content_source"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ruleset_reference_source_key_unique" ON "ruleset_reference" USING btree ("source_id","key");
--> statement-breakpoint
-- A small navigation index into the official SRD. Page is the printed page number.
INSERT INTO "ruleset_reference" ("source_id", "key", "category", "title", "page")
SELECT source."id", entry."key", entry."category", entry."title", entry."page"
FROM "ruleset_content_source" source
JOIN "ruleset_version" version ON version."id" = source."ruleset_version_id"
JOIN "ruleset" rules ON rules."id" = version."ruleset_id"
CROSS JOIN (VALUES
  ('d20-tests', 'Core rules', 'D20 Tests', 6),
  ('combat', 'Core rules', 'Combat', 13),
  ('rules-glossary', 'Core rules', 'Rules Glossary', 176),
  ('combat-encounters', 'Encounter preparation', 'Combat Encounters', 202),
  ('monsters', 'Encounter preparation', 'Monsters', 254)
) AS entry("key", "category", "title", "page")
WHERE rules."key" = 'dnd-5e-2024' AND version."version" = '5.2.1'
  AND source."key" = 'srd-5.2.1-en';
