CREATE TABLE "campaign" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"purge_after" timestamp with time zone,
	CONSTRAINT "campaign_trash_retention_check" CHECK (
    ("campaign"."deleted_at" IS NULL AND "campaign"."purge_after" IS NULL) OR
    ("campaign"."deleted_at" IS NOT NULL AND "campaign"."purge_after" IS NOT NULL
      AND isfinite("campaign"."deleted_at")
      AND "campaign"."purge_after" = (("campaign"."deleted_at" AT TIME ZONE 'UTC') + interval '30 days') AT TIME ZONE 'UTC')
  )
);
--> statement-breakpoint
CREATE TABLE "campaign_compass" (
	"campaign_id" uuid PRIMARY KEY NOT NULL,
	"original_premise" text NOT NULL,
	"current_premise" text NOT NULL,
	"setting" text,
	"tone" text,
	"original_notes" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_compass_revision_positive" CHECK ("campaign_compass"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "campaign_compass_guideline" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"sort_order" integer,
	CONSTRAINT "campaign_compass_guideline_kind_check" CHECK ("campaign_compass_guideline"."kind" IN ('theme', 'gm_priority', 'boundary', 'style', 'other'))
);
--> statement-breakpoint
CREATE TABLE "campaign_ruleset" (
	"campaign_id" uuid PRIMARY KEY NOT NULL,
	"ruleset_id" uuid NOT NULL,
	"ruleset_version_id" uuid NOT NULL,
	"pinned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_owner_user_id_user_account_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_compass" ADD CONSTRAINT "campaign_compass_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_compass_guideline" ADD CONSTRAINT "campaign_compass_guideline_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_ruleset" ADD CONSTRAINT "campaign_ruleset_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_ruleset" ADD CONSTRAINT "campaign_ruleset_version_fk" FOREIGN KEY ("ruleset_id","ruleset_version_id") REFERENCES "public"."ruleset_version"("ruleset_id","id") ON DELETE restrict ON UPDATE no action;