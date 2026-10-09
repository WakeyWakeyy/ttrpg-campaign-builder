CREATE TABLE "reward_grant" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"source_campaign_id" uuid,
	"reward_id" uuid,
	"session_campaign_id" uuid,
	"session_id" uuid,
	"reward_title" text NOT NULL,
	"recipient" text NOT NULL,
	"notes" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_grant_source_scope" CHECK (("reward_grant"."reward_id" IS NULL AND "reward_grant"."source_campaign_id" IS NULL)
    OR ("reward_grant"."reward_id" IS NOT NULL AND "reward_grant"."source_campaign_id" IS NOT NULL
      AND "reward_grant"."source_campaign_id" = "reward_grant"."campaign_id")),
	CONSTRAINT "reward_grant_session_scope" CHECK (("reward_grant"."session_id" IS NULL AND "reward_grant"."session_campaign_id" IS NULL)
    OR ("reward_grant"."session_id" IS NOT NULL AND "reward_grant"."session_campaign_id" IS NOT NULL
      AND "reward_grant"."session_campaign_id" = "reward_grant"."campaign_id")),
	CONSTRAINT "reward_grant_recipient_nonempty" CHECK (length(btrim("reward_grant"."recipient")) > 0),
	CONSTRAINT "reward_grant_title_nonempty" CHECK (length(btrim("reward_grant"."reward_title")) > 0)
);
--> statement-breakpoint
CREATE TABLE "reward_grant_component" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"grant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "reward_grant_component_kind_check" CHECK ("reward_grant_component"."kind" IN ('MONEY', 'ITEM', 'INFORMATION', 'REPUTATION', 'FAVOR', 'ACCESS', 'PROGRESSION', 'OTHER')),
	CONSTRAINT "reward_grant_component_description_nonempty" CHECK (length(btrim("reward_grant_component"."description")) > 0)
);
--> statement-breakpoint
ALTER TABLE "reward_grant" ADD CONSTRAINT "reward_grant_campaign_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_grant" ADD CONSTRAINT "reward_grant_source_fk" FOREIGN KEY ("source_campaign_id","reward_id") REFERENCES "public"."reward"("campaign_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_grant" ADD CONSTRAINT "reward_grant_session_fk" FOREIGN KEY ("session_campaign_id","session_id") REFERENCES "public"."session"("campaign_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_grant_component" ADD CONSTRAINT "reward_grant_component_grant_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."reward_grant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reward_grant_request_unique" ON "reward_grant" USING btree ("campaign_id","request_key");--> statement-breakpoint
CREATE INDEX "reward_grant_campaign_time_idx" ON "reward_grant" USING btree ("campaign_id","granted_at");--> statement-breakpoint
CREATE INDEX "reward_grant_component_grant_idx" ON "reward_grant_component" USING btree ("grant_id");
