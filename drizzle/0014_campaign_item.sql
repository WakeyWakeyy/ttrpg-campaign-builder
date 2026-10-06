CREATE TABLE "item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"entity_type" text DEFAULT 'ITEM' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"significance" text,
	"current_state" text,
	"notes" text,
	"location_id" uuid,
	"npc_holder_id" uuid,
	"player_character_holder_id" uuid,
	CONSTRAINT "item_entity_type_check" CHECK ("item"."entity_type" = 'ITEM'),
	CONSTRAINT "item_name_nonempty" CHECK (length(btrim("item"."name")) > 0),
	CONSTRAINT "item_one_locator" CHECK (num_nonnulls("item"."location_id", "item"."npc_holder_id", "item"."player_character_holder_id") <= 1)
);
--> statement-breakpoint
ALTER TABLE "campaign_entity" DROP CONSTRAINT "campaign_entity_type_check";--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_campaign_entity_fk" FOREIGN KEY ("campaign_id","id","entity_type") REFERENCES "public"."campaign_entity"("campaign_id","id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_location_fk" FOREIGN KEY ("campaign_id","location_id") REFERENCES "public"."location"("campaign_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_npc_holder_fk" FOREIGN KEY ("campaign_id","npc_holder_id") REFERENCES "public"."npc"("campaign_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_pc_holder_fk" FOREIGN KEY ("campaign_id","player_character_holder_id") REFERENCES "public"."player_character"("campaign_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_campaign_id_id_unique" ON "item" USING btree ("campaign_id","id");--> statement-breakpoint
CREATE INDEX "item_campaign_idx" ON "item" USING btree ("campaign_id");--> statement-breakpoint
ALTER TABLE "campaign_entity" ADD CONSTRAINT "campaign_entity_type_check" CHECK ("campaign_entity"."entity_type" IN ('LOCATION', 'ARC', 'QUEST', 'NPC', 'PLAYER_CHARACTER', 'PARTY', 'FACTION', 'TRAVEL_ROUTE', 'ITEM'));
