CREATE TABLE "campaign_entity" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"purge_after" timestamp with time zone,
	CONSTRAINT "campaign_entity_type_check" CHECK ("campaign_entity"."entity_type" = 'LOCATION'),
	CONSTRAINT "campaign_entity_revision_positive" CHECK ("campaign_entity"."revision" > 0),
	CONSTRAINT "campaign_entity_trash_retention_check" CHECK (
    ("campaign_entity"."deleted_at" IS NULL AND "campaign_entity"."purge_after" IS NULL) OR
    ("campaign_entity"."deleted_at" IS NOT NULL AND "campaign_entity"."purge_after" IS NOT NULL
      AND isfinite("campaign_entity"."deleted_at")
      AND "campaign_entity"."purge_after" = (("campaign_entity"."deleted_at" AT TIME ZONE 'UTC') + interval '30 days') AT TIME ZONE 'UTC')
  )
);
--> statement-breakpoint
CREATE TABLE "location" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_location_id" uuid,
	CONSTRAINT "location_parent_not_self" CHECK ("location"."parent_location_id" <> "location"."id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_entity_campaign_id_id_unique" ON "campaign_entity" USING btree ("campaign_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "location_campaign_id_id_unique" ON "location" USING btree ("campaign_id","id");--> statement-breakpoint
ALTER TABLE "campaign_entity" ADD CONSTRAINT "campaign_entity_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_entity" ADD CONSTRAINT "campaign_entity_created_by_user_id_user_account_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location" ADD CONSTRAINT "location_campaign_entity_fk" FOREIGN KEY ("campaign_id","id") REFERENCES "public"."campaign_entity"("campaign_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location" ADD CONSTRAINT "location_parent_same_campaign_fk" FOREIGN KEY ("campaign_id","parent_location_id") REFERENCES "public"."location"("campaign_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "location_campaign_parent_idx" ON "location" USING btree ("campaign_id","parent_location_id");
