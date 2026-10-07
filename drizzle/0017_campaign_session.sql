CREATE TABLE "session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"entity_type" text DEFAULT 'SESSION' NOT NULL,
	"title" text NOT NULL,
	"planned_for" date,
	"preparation" text,
	"outcome" text,
	CONSTRAINT "session_entity_type_check" CHECK ("session"."entity_type" = 'SESSION'),
	CONSTRAINT "session_title_nonempty" CHECK (length(btrim("session"."title")) > 0)
);
--> statement-breakpoint
ALTER TABLE "campaign_entity" DROP CONSTRAINT "campaign_entity_type_check";--> statement-breakpoint
CREATE UNIQUE INDEX "session_campaign_id_id_unique" ON "session" USING btree ("campaign_id","id");--> statement-breakpoint
CREATE INDEX "session_campaign_planned_for_idx" ON "session" USING btree ("campaign_id","planned_for");--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_entity_fk" FOREIGN KEY ("campaign_id","id","entity_type") REFERENCES "public"."campaign_entity"("campaign_id","id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_entity" ADD CONSTRAINT "campaign_entity_type_check" CHECK ("campaign_entity"."entity_type" IN ('LOCATION', 'ARC', 'QUEST', 'NPC', 'PLAYER_CHARACTER', 'PARTY', 'FACTION', 'TRAVEL_ROUTE', 'ITEM', 'RELATIONSHIP', 'TIMELINE_EVENT', 'SESSION'));
