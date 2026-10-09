CREATE TABLE "encounter" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"entity_type" text DEFAULT 'ENCOUNTER' NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	CONSTRAINT "encounter_entity_type_check" CHECK ("encounter"."entity_type" = 'ENCOUNTER'),
	CONSTRAINT "encounter_title_nonempty" CHECK (length(btrim("encounter"."title")) > 0)
);
--> statement-breakpoint
CREATE TABLE "encounter_srd_521_creature" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"encounter_id" uuid NOT NULL,
	"name" text NOT NULL,
	"xp" integer NOT NULL,
	"quantity" integer NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "encounter_creature_name_nonempty" CHECK (length(btrim("encounter_srd_521_creature"."name")) > 0),
	CONSTRAINT "encounter_creature_xp_nonnegative" CHECK ("encounter_srd_521_creature"."xp" >= 0),
	CONSTRAINT "encounter_creature_quantity_positive" CHECK ("encounter_srd_521_creature"."quantity" BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE TABLE "encounter_srd_521_plan" (
	"encounter_id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"party_level" integer NOT NULL,
	"party_size" integer NOT NULL,
	CONSTRAINT "encounter_srd_plan_level_check" CHECK ("encounter_srd_521_plan"."party_level" BETWEEN 1 AND 20),
	CONSTRAINT "encounter_srd_plan_size_check" CHECK ("encounter_srd_521_plan"."party_size" BETWEEN 1 AND 20)
);
--> statement-breakpoint
ALTER TABLE "campaign_entity" DROP CONSTRAINT "campaign_entity_type_check";--> statement-breakpoint
ALTER TABLE "encounter" ADD CONSTRAINT "encounter_entity_fk" FOREIGN KEY ("campaign_id","id","entity_type") REFERENCES "public"."campaign_entity"("campaign_id","id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "encounter_campaign_id_id_unique" ON "encounter" USING btree ("campaign_id","id");--> statement-breakpoint
ALTER TABLE "encounter_srd_521_creature" ADD CONSTRAINT "encounter_creature_encounter_fk" FOREIGN KEY ("campaign_id","encounter_id") REFERENCES "public"."encounter"("campaign_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounter_srd_521_plan" ADD CONSTRAINT "encounter_srd_plan_encounter_fk" FOREIGN KEY ("campaign_id","encounter_id") REFERENCES "public"."encounter"("campaign_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "encounter_campaign_idx" ON "encounter" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "encounter_creature_encounter_idx" ON "encounter_srd_521_creature" USING btree ("encounter_id");--> statement-breakpoint
ALTER TABLE "campaign_entity" ADD CONSTRAINT "campaign_entity_type_check" CHECK ("campaign_entity"."entity_type" IN ('LOCATION', 'ARC', 'QUEST', 'NPC', 'PLAYER_CHARACTER', 'PARTY', 'FACTION', 'TRAVEL_ROUTE', 'ITEM', 'RELATIONSHIP', 'TIMELINE_EVENT', 'SESSION', 'ENCOUNTER'));
