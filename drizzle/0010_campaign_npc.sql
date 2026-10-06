CREATE TABLE "npc" (
  "id" uuid PRIMARY KEY NOT NULL,
  "campaign_id" uuid NOT NULL,
  "entity_type" text DEFAULT 'NPC' NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "role" text,
  "current_state" text,
  CONSTRAINT "npc_entity_type_check" CHECK ("npc"."entity_type" = 'NPC'),
  CONSTRAINT "npc_name_nonempty" CHECK (length(btrim("npc"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "campaign_entity" DROP CONSTRAINT "campaign_entity_type_check";--> statement-breakpoint
CREATE UNIQUE INDEX "npc_campaign_id_id_unique" ON "npc" USING btree ("campaign_id","id");--> statement-breakpoint
CREATE INDEX "npc_campaign_idx" ON "npc" USING btree ("campaign_id");--> statement-breakpoint
ALTER TABLE "npc" ADD CONSTRAINT "npc_campaign_entity_fk" FOREIGN KEY ("campaign_id","id","entity_type") REFERENCES "public"."campaign_entity"("campaign_id","id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_entity" ADD CONSTRAINT "campaign_entity_type_check" CHECK ("campaign_entity"."entity_type" IN ('LOCATION', 'ARC', 'QUEST', 'NPC'));
