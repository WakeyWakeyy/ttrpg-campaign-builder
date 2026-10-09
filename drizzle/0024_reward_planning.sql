CREATE TABLE "reward" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"entity_type" text DEFAULT 'REWARD' NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	CONSTRAINT "reward_entity_type_check" CHECK ("reward"."entity_type" = 'REWARD'),
	CONSTRAINT "reward_title_nonempty" CHECK (length(btrim("reward"."title")) > 0)
);
--> statement-breakpoint
CREATE TABLE "reward_component" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"reward_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "reward_component_kind_check" CHECK ("reward_component"."kind" IN ('MONEY', 'ITEM', 'INFORMATION', 'REPUTATION', 'FAVOR', 'ACCESS', 'PROGRESSION', 'OTHER')),
	CONSTRAINT "reward_component_description_nonempty" CHECK (length(btrim("reward_component"."description")) > 0)
);
--> statement-breakpoint
ALTER TABLE "campaign_entity" DROP CONSTRAINT "campaign_entity_type_check";--> statement-breakpoint
ALTER TABLE "reward" ADD CONSTRAINT "reward_entity_fk" FOREIGN KEY ("campaign_id","id","entity_type") REFERENCES "public"."campaign_entity"("campaign_id","id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_component" ADD CONSTRAINT "reward_component_reward_fk" FOREIGN KEY ("campaign_id","reward_id") REFERENCES "public"."reward"("campaign_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reward_campaign_id_id_unique" ON "reward" USING btree ("campaign_id","id");--> statement-breakpoint
CREATE INDEX "reward_campaign_idx" ON "reward" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "reward_component_reward_idx" ON "reward_component" USING btree ("reward_id");--> statement-breakpoint
ALTER TABLE "campaign_entity" ADD CONSTRAINT "campaign_entity_type_check" CHECK ("campaign_entity"."entity_type" IN ('LOCATION', 'ARC', 'QUEST', 'NPC', 'PLAYER_CHARACTER', 'PARTY', 'FACTION', 'TRAVEL_ROUTE', 'ITEM', 'RELATIONSHIP', 'TIMELINE_EVENT', 'SESSION', 'ENCOUNTER', 'REWARD'));