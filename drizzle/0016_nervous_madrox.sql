CREATE TABLE "timeline_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"entity_type" text DEFAULT 'TIMELINE_EVENT' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"occurred_at" timestamp with time zone,
	"in_world_date" text,
	CONSTRAINT "timeline_event_entity_type_check" CHECK ("timeline_event"."entity_type" = 'TIMELINE_EVENT'),
	CONSTRAINT "timeline_event_title_nonempty" CHECK (length(btrim("timeline_event"."title")) > 0)
);
--> statement-breakpoint
CREATE TABLE "timeline_event_link" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"target_campaign_id" uuid,
	"target_entity_id" uuid,
	"target_type_snapshot" text NOT NULL,
	"target_name_snapshot" text NOT NULL,
	CONSTRAINT "timeline_event_link_campaign_check" CHECK (("timeline_event_link"."target_campaign_id" IS NULL AND "timeline_event_link"."target_entity_id" IS NULL) OR ("timeline_event_link"."target_campaign_id" = "timeline_event_link"."campaign_id" AND "timeline_event_link"."target_entity_id" IS NOT NULL)),
	CONSTRAINT "timeline_event_link_type_nonempty" CHECK (length(btrim("timeline_event_link"."target_type_snapshot")) > 0),
	CONSTRAINT "timeline_event_link_name_nonempty" CHECK (length(btrim("timeline_event_link"."target_name_snapshot")) > 0)
);
--> statement-breakpoint
ALTER TABLE "campaign_entity" DROP CONSTRAINT "campaign_entity_type_check";--> statement-breakpoint
CREATE UNIQUE INDEX "timeline_event_campaign_id_id_unique" ON "timeline_event" USING btree ("campaign_id","id");--> statement-breakpoint
ALTER TABLE "timeline_event" ADD CONSTRAINT "timeline_event_entity_fk" FOREIGN KEY ("campaign_id","id","entity_type") REFERENCES "public"."campaign_entity"("campaign_id","id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_event_link" ADD CONSTRAINT "timeline_event_link_event_fk" FOREIGN KEY ("campaign_id","event_id") REFERENCES "public"."timeline_event"("campaign_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_event_link" ADD CONSTRAINT "timeline_event_link_target_fk" FOREIGN KEY ("target_campaign_id","target_entity_id") REFERENCES "public"."campaign_entity"("campaign_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "timeline_event_occurred_at_idx" ON "timeline_event" USING btree ("campaign_id","occurred_at");--> statement-breakpoint
CREATE INDEX "timeline_event_link_target_idx" ON "timeline_event_link" USING btree ("target_campaign_id","target_entity_id");--> statement-breakpoint
ALTER TABLE "campaign_entity" ADD CONSTRAINT "campaign_entity_type_check" CHECK ("campaign_entity"."entity_type" IN ('LOCATION', 'ARC', 'QUEST', 'NPC', 'PLAYER_CHARACTER', 'PARTY', 'FACTION', 'TRAVEL_ROUTE', 'ITEM', 'RELATIONSHIP', 'TIMELINE_EVENT'));
