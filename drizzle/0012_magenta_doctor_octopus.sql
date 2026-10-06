CREATE TABLE "faction" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"entity_type" text DEFAULT 'FACTION' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"purpose" text,
	"current_state" text,
	CONSTRAINT "faction_entity_type_check" CHECK ("faction"."entity_type" = 'FACTION'),
	CONSTRAINT "faction_name_nonempty" CHECK (length(btrim("faction"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "faction_membership" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"faction_id" uuid NOT NULL,
	"npc_id" uuid,
	"player_character_id" uuid,
	"role" text,
	"rank" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "faction_membership_one_member" CHECK (("faction_membership"."npc_id" IS NULL) <> ("faction_membership"."player_character_id" IS NULL)),
	CONSTRAINT "faction_membership_status_check" CHECK ("faction_membership"."status" IN ('ACTIVE', 'FORMER'))
);
--> statement-breakpoint
ALTER TABLE "campaign_entity" DROP CONSTRAINT "campaign_entity_type_check";--> statement-breakpoint
CREATE UNIQUE INDEX "faction_campaign_id_id_unique" ON "faction" USING btree ("campaign_id","id");--> statement-breakpoint
CREATE INDEX "faction_campaign_idx" ON "faction" USING btree ("campaign_id");--> statement-breakpoint
ALTER TABLE "faction" ADD CONSTRAINT "faction_campaign_entity_fk" FOREIGN KEY ("campaign_id","id","entity_type") REFERENCES "public"."campaign_entity"("campaign_id","id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_membership" ADD CONSTRAINT "faction_membership_faction_fk" FOREIGN KEY ("campaign_id","faction_id") REFERENCES "public"."faction"("campaign_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_membership" ADD CONSTRAINT "faction_membership_npc_fk" FOREIGN KEY ("campaign_id","npc_id") REFERENCES "public"."npc"("campaign_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faction_membership" ADD CONSTRAINT "faction_membership_pc_fk" FOREIGN KEY ("campaign_id","player_character_id") REFERENCES "public"."player_character"("campaign_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "faction_membership_faction_idx" ON "faction_membership" USING btree ("faction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "faction_membership_npc_unique" ON "faction_membership" USING btree ("faction_id","npc_id");--> statement-breakpoint
CREATE UNIQUE INDEX "faction_membership_pc_unique" ON "faction_membership" USING btree ("faction_id","player_character_id");--> statement-breakpoint
ALTER TABLE "campaign_entity" ADD CONSTRAINT "campaign_entity_type_check" CHECK ("campaign_entity"."entity_type" IN ('LOCATION', 'ARC', 'QUEST', 'NPC', 'PLAYER_CHARACTER', 'PARTY', 'FACTION'));
