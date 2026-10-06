CREATE TABLE "party" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"entity_type" text DEFAULT 'PARTY' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "party_entity_type_check" CHECK ("party"."entity_type" = 'PARTY'),
	CONSTRAINT "party_name_nonempty" CHECK (length(btrim("party"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "party_member" (
	"campaign_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"player_character_id" uuid NOT NULL,
	CONSTRAINT "party_member_party_id_player_character_id_pk" PRIMARY KEY("party_id","player_character_id")
);
--> statement-breakpoint
CREATE TABLE "player_character" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"entity_type" text DEFAULT 'PLAYER_CHARACTER' NOT NULL,
	"name" text NOT NULL,
	"player_name" text,
	"description" text,
	"current_state" text,
	CONSTRAINT "player_character_entity_type_check" CHECK ("player_character"."entity_type" = 'PLAYER_CHARACTER'),
	CONSTRAINT "player_character_name_nonempty" CHECK (length(btrim("player_character"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "campaign_entity" DROP CONSTRAINT "campaign_entity_type_check";--> statement-breakpoint
CREATE UNIQUE INDEX "party_campaign_id_id_unique" ON "party" USING btree ("campaign_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_character_campaign_id_id_unique" ON "player_character" USING btree ("campaign_id","id");--> statement-breakpoint
ALTER TABLE "party" ADD CONSTRAINT "party_campaign_entity_fk" FOREIGN KEY ("campaign_id","id","entity_type") REFERENCES "public"."campaign_entity"("campaign_id","id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_member" ADD CONSTRAINT "party_member_party_fk" FOREIGN KEY ("campaign_id","party_id") REFERENCES "public"."party"("campaign_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_member" ADD CONSTRAINT "party_member_player_character_fk" FOREIGN KEY ("campaign_id","player_character_id") REFERENCES "public"."player_character"("campaign_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_character" ADD CONSTRAINT "player_character_campaign_entity_fk" FOREIGN KEY ("campaign_id","id","entity_type") REFERENCES "public"."campaign_entity"("campaign_id","id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "party_campaign_idx" ON "party" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "player_character_campaign_idx" ON "player_character" USING btree ("campaign_id");--> statement-breakpoint
ALTER TABLE "campaign_entity" ADD CONSTRAINT "campaign_entity_type_check" CHECK ("campaign_entity"."entity_type" IN ('LOCATION', 'ARC', 'QUEST', 'NPC', 'PLAYER_CHARACTER', 'PARTY'));
