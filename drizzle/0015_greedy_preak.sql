CREATE TABLE "semantic_relationship" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"entity_type" text DEFAULT 'RELATIONSHIP' NOT NULL,
	"source_entity_id" uuid NOT NULL,
	"target_entity_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"description" text,
	CONSTRAINT "semantic_relationship_entity_type_check" CHECK ("semantic_relationship"."entity_type" = 'RELATIONSHIP'),
	CONSTRAINT "semantic_relationship_kind_nonempty" CHECK (length(btrim("semantic_relationship"."kind")) > 0),
	CONSTRAINT "semantic_relationship_distinct_endpoints" CHECK ("semantic_relationship"."source_entity_id" <> "semantic_relationship"."target_entity_id")
);
--> statement-breakpoint
ALTER TABLE "campaign_entity" DROP CONSTRAINT "campaign_entity_type_check";--> statement-breakpoint
ALTER TABLE "semantic_relationship" ADD CONSTRAINT "semantic_relationship_entity_fk" FOREIGN KEY ("campaign_id","id","entity_type") REFERENCES "public"."campaign_entity"("campaign_id","id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semantic_relationship" ADD CONSTRAINT "semantic_relationship_source_fk" FOREIGN KEY ("campaign_id","source_entity_id") REFERENCES "public"."campaign_entity"("campaign_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semantic_relationship" ADD CONSTRAINT "semantic_relationship_target_fk" FOREIGN KEY ("campaign_id","target_entity_id") REFERENCES "public"."campaign_entity"("campaign_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "semantic_relationship_campaign_id_id_unique" ON "semantic_relationship" USING btree ("campaign_id","id");--> statement-breakpoint
CREATE INDEX "semantic_relationship_source_idx" ON "semantic_relationship" USING btree ("campaign_id","source_entity_id");--> statement-breakpoint
CREATE INDEX "semantic_relationship_target_idx" ON "semantic_relationship" USING btree ("campaign_id","target_entity_id");--> statement-breakpoint
ALTER TABLE "campaign_entity" ADD CONSTRAINT "campaign_entity_type_check" CHECK ("campaign_entity"."entity_type" IN ('LOCATION', 'ARC', 'QUEST', 'NPC', 'PLAYER_CHARACTER', 'PARTY', 'FACTION', 'TRAVEL_ROUTE', 'ITEM', 'RELATIONSHIP'));