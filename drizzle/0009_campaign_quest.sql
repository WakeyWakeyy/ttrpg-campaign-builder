CREATE TABLE "arc_quest" (
	"campaign_id" uuid NOT NULL,
	"arc_id" uuid NOT NULL,
	"quest_id" uuid NOT NULL,
	CONSTRAINT "arc_quest_arc_id_quest_id_pk" PRIMARY KEY("arc_id","quest_id")
);
--> statement-breakpoint
CREATE TABLE "quest" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"entity_type" text DEFAULT 'QUEST' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"parent_quest_id" uuid,
	CONSTRAINT "quest_entity_type_check" CHECK ("quest"."entity_type" = 'QUEST'),
	CONSTRAINT "quest_name_nonempty" CHECK (length(btrim("quest"."name")) > 0),
	CONSTRAINT "quest_parent_not_self" CHECK ("quest"."parent_quest_id" <> "quest"."id"),
	CONSTRAINT "quest_status_check" CHECK ("quest"."status" IN ('OPEN', 'RESOLVED', 'FAILED', 'POSTPONED', 'ABANDONED'))
);
--> statement-breakpoint
ALTER TABLE "campaign_entity" DROP CONSTRAINT "campaign_entity_type_check";--> statement-breakpoint
CREATE UNIQUE INDEX "arc_campaign_id_id_unique" ON "arc" USING btree ("campaign_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "quest_campaign_id_id_unique" ON "quest" USING btree ("campaign_id","id");--> statement-breakpoint
ALTER TABLE "arc_quest" ADD CONSTRAINT "arc_quest_arc_fk" FOREIGN KEY ("campaign_id","arc_id") REFERENCES "public"."arc"("campaign_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arc_quest" ADD CONSTRAINT "arc_quest_quest_fk" FOREIGN KEY ("campaign_id","quest_id") REFERENCES "public"."quest"("campaign_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest" ADD CONSTRAINT "quest_campaign_entity_fk" FOREIGN KEY ("campaign_id","id","entity_type") REFERENCES "public"."campaign_entity"("campaign_id","id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest" ADD CONSTRAINT "quest_parent_same_campaign_fk" FOREIGN KEY ("campaign_id","parent_quest_id") REFERENCES "public"."quest"("campaign_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quest_campaign_parent_idx" ON "quest" USING btree ("campaign_id","parent_quest_id");--> statement-breakpoint
ALTER TABLE "campaign_entity" ADD CONSTRAINT "campaign_entity_type_check" CHECK ("campaign_entity"."entity_type" IN ('LOCATION', 'ARC', 'QUEST'));
