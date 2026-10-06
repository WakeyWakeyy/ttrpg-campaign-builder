CREATE TABLE "arc" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"entity_type" text DEFAULT 'ARC' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "arc_entity_type_check" CHECK ("arc"."entity_type" = 'ARC'),
	CONSTRAINT "arc_name_nonempty" CHECK (length(btrim("arc"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "campaign_entity" DROP CONSTRAINT "campaign_entity_type_check";--> statement-breakpoint
ALTER TABLE "location" DROP CONSTRAINT "location_campaign_entity_fk";
--> statement-breakpoint
ALTER TABLE "location" ADD COLUMN "entity_type" text DEFAULT 'LOCATION' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_entity_campaign_id_id_type_unique" ON "campaign_entity" USING btree ("campaign_id","id","entity_type");--> statement-breakpoint
ALTER TABLE "arc" ADD CONSTRAINT "arc_campaign_entity_fk" FOREIGN KEY ("campaign_id","id","entity_type") REFERENCES "public"."campaign_entity"("campaign_id","id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "arc_campaign_idx" ON "arc" USING btree ("campaign_id");--> statement-breakpoint
ALTER TABLE "location" ADD CONSTRAINT "location_campaign_entity_fk" FOREIGN KEY ("campaign_id","id","entity_type") REFERENCES "public"."campaign_entity"("campaign_id","id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_entity" ADD CONSTRAINT "campaign_entity_type_check" CHECK ("campaign_entity"."entity_type" IN ('LOCATION', 'ARC'));--> statement-breakpoint
ALTER TABLE "location" ADD CONSTRAINT "location_entity_type_check" CHECK ("location"."entity_type" = 'LOCATION');
