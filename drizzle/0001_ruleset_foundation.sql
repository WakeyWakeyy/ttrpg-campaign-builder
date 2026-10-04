CREATE TABLE "ruleset" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ruleset_content_source" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"ruleset_version_id" uuid NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"source_url" text NOT NULL,
	"license" text NOT NULL,
	"license_url" text NOT NULL,
	"attribution" text NOT NULL,
	"published_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ruleset_version" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"ruleset_id" uuid NOT NULL,
	"version" text NOT NULL,
	"name" text NOT NULL,
	"published_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_identity" ALTER COLUMN "id" SET DEFAULT uuidv7();--> statement-breakpoint
ALTER TABLE "user_account" ALTER COLUMN "id" SET DEFAULT uuidv7();--> statement-breakpoint
ALTER TABLE "ruleset_content_source" ADD CONSTRAINT "ruleset_content_source_ruleset_version_id_ruleset_version_id_fk" FOREIGN KEY ("ruleset_version_id") REFERENCES "public"."ruleset_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruleset_version" ADD CONSTRAINT "ruleset_version_ruleset_id_ruleset_id_fk" FOREIGN KEY ("ruleset_id") REFERENCES "public"."ruleset"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ruleset_key_unique" ON "ruleset" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "ruleset_content_source_version_key_unique" ON "ruleset_content_source" USING btree ("ruleset_version_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "ruleset_version_ruleset_version_unique" ON "ruleset_version" USING btree ("ruleset_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "ruleset_version_ruleset_id_unique" ON "ruleset_version" USING btree ("ruleset_id","id");
--> statement-breakpoint
-- Metadata only. Publication date: https://www.dndbeyond.com/srd
-- Attribution transcribed from the Legal Information page of the official PDF.
INSERT INTO "ruleset" ("key", "name")
VALUES ('dnd-5e-2024', 'D&D Fifth Edition (2024)');
--> statement-breakpoint
INSERT INTO "ruleset_version" ("ruleset_id", "version", "name", "published_at")
SELECT "id", '5.2.1', 'SRD 5.2.1', DATE '2025-05-01'
FROM "ruleset" WHERE "key" = 'dnd-5e-2024';
--> statement-breakpoint
INSERT INTO "ruleset_content_source" (
  "ruleset_version_id", "key", "title", "source_url", "license",
  "license_url", "attribution", "published_at"
)
SELECT v."id", 'srd-5.2.1-en', 'System Reference Document 5.2.1',
  'https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf',
  'CC-BY-4.0', 'https://creativecommons.org/licenses/by/4.0/legalcode',
  'This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.',
  DATE '2025-05-01'
FROM "ruleset_version" v
JOIN "ruleset" r ON r."id" = v."ruleset_id"
WHERE r."key" = 'dnd-5e-2024' AND v."version" = '5.2.1';
