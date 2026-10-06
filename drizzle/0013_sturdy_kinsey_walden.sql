CREATE TABLE "travel_route" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"entity_type" text DEFAULT 'TRAVEL_ROUTE' NOT NULL,
	"name" text NOT NULL,
	"from_location_id" uuid NOT NULL,
	"to_location_id" uuid NOT NULL,
	"distance" text,
	"duration" text,
	"mode" text,
	"hazards" text,
	"notes" text,
	CONSTRAINT "travel_route_entity_type_check" CHECK ("travel_route"."entity_type" = 'TRAVEL_ROUTE'),
	CONSTRAINT "travel_route_name_nonempty" CHECK (length(btrim("travel_route"."name")) > 0),
	CONSTRAINT "travel_route_distinct_locations" CHECK ("travel_route"."from_location_id" <> "travel_route"."to_location_id")
);
--> statement-breakpoint
ALTER TABLE "campaign_entity" DROP CONSTRAINT "campaign_entity_type_check";--> statement-breakpoint
ALTER TABLE "travel_route" ADD CONSTRAINT "travel_route_campaign_entity_fk" FOREIGN KEY ("campaign_id","id","entity_type") REFERENCES "public"."campaign_entity"("campaign_id","id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_route" ADD CONSTRAINT "travel_route_from_location_fk" FOREIGN KEY ("campaign_id","from_location_id") REFERENCES "public"."location"("campaign_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_route" ADD CONSTRAINT "travel_route_to_location_fk" FOREIGN KEY ("campaign_id","to_location_id") REFERENCES "public"."location"("campaign_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "travel_route_campaign_id_id_unique" ON "travel_route" USING btree ("campaign_id","id");--> statement-breakpoint
CREATE INDEX "travel_route_campaign_idx" ON "travel_route" USING btree ("campaign_id");--> statement-breakpoint
ALTER TABLE "campaign_entity" ADD CONSTRAINT "campaign_entity_type_check" CHECK ("campaign_entity"."entity_type" IN ('LOCATION', 'ARC', 'QUEST', 'NPC', 'PLAYER_CHARACTER', 'PARTY', 'FACTION', 'TRAVEL_ROUTE'));