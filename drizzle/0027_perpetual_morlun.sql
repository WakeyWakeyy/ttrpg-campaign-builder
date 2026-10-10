CREATE TABLE "secret" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"entity_type" text DEFAULT 'SECRET' NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	CONSTRAINT "secret_entity_type_check" CHECK ("secret"."entity_type" = 'SECRET'),
	CONSTRAINT "secret_title_nonempty" CHECK (length(btrim("secret"."title")) > 0),
	CONSTRAINT "secret_content_nonempty" CHECK (length(btrim("secret"."content")) > 0)
);
--> statement-breakpoint
ALTER TABLE "campaign_entity" DROP CONSTRAINT "campaign_entity_type_check";--> statement-breakpoint
ALTER TABLE "clue" ADD COLUMN "secret_id" uuid;--> statement-breakpoint
ALTER TABLE "secret" ADD CONSTRAINT "secret_entity_fk" FOREIGN KEY ("campaign_id","id","entity_type") REFERENCES "public"."campaign_entity"("campaign_id","id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "secret_campaign_id_id_unique" ON "secret" USING btree ("campaign_id","id");--> statement-breakpoint
CREATE INDEX "secret_campaign_idx" ON "secret" USING btree ("campaign_id");--> statement-breakpoint
ALTER TABLE "clue" ADD CONSTRAINT "clue_secret_fk" FOREIGN KEY ("campaign_id","secret_id") REFERENCES "public"."secret"("campaign_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_entity" ADD CONSTRAINT "campaign_entity_type_check" CHECK ("campaign_entity"."entity_type" IN ('LOCATION', 'ARC', 'QUEST', 'NPC', 'PLAYER_CHARACTER', 'PARTY', 'FACTION', 'TRAVEL_ROUTE', 'ITEM', 'RELATIONSHIP', 'TIMELINE_EVENT', 'SESSION', 'ENCOUNTER', 'REWARD', 'CLUE', 'SECRET'));