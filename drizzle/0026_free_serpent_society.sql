CREATE TABLE "clue" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"entity_type" text DEFAULT 'CLUE' NOT NULL,
	"title" text NOT NULL,
	"secret" text NOT NULL,
	"discovery_location_id" uuid,
	CONSTRAINT "clue_entity_type_check" CHECK ("clue"."entity_type" = 'CLUE'),
	CONSTRAINT "clue_title_nonempty" CHECK (length(btrim("clue"."title")) > 0),
	CONSTRAINT "clue_secret_nonempty" CHECK (length(btrim("clue"."secret")) > 0)
);
--> statement-breakpoint
ALTER TABLE "campaign_entity" DROP CONSTRAINT "campaign_entity_type_check";--> statement-breakpoint
ALTER TABLE "clue" ADD CONSTRAINT "clue_entity_fk" FOREIGN KEY ("campaign_id","id","entity_type") REFERENCES "public"."campaign_entity"("campaign_id","id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clue" ADD CONSTRAINT "clue_discovery_location_fk" FOREIGN KEY ("campaign_id","discovery_location_id") REFERENCES "public"."location"("campaign_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clue_campaign_id_id_unique" ON "clue" USING btree ("campaign_id","id");--> statement-breakpoint
CREATE INDEX "clue_campaign_idx" ON "clue" USING btree ("campaign_id");--> statement-breakpoint
ALTER TABLE "campaign_entity" ADD CONSTRAINT "campaign_entity_type_check" CHECK ("campaign_entity"."entity_type" IN ('LOCATION', 'ARC', 'QUEST', 'NPC', 'PLAYER_CHARACTER', 'PARTY', 'FACTION', 'TRAVEL_ROUTE', 'ITEM', 'RELATIONSHIP', 'TIMELINE_EVENT', 'SESSION', 'ENCOUNTER', 'REWARD', 'CLUE'));