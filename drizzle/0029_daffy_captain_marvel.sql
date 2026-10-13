CREATE TABLE "campaign_intelligence_preferences" (
	"campaign_id" uuid PRIMARY KEY NOT NULL,
	"quest_continuity" boolean DEFAULT true NOT NULL,
	"timeline_dates" boolean DEFAULT true NOT NULL,
	"clue_routes" boolean DEFAULT true NOT NULL,
	"secret_discovery" boolean DEFAULT true NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "campaign_intelligence_preferences_revision_positive" CHECK ("campaign_intelligence_preferences"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "campaign_intelligence_preferences" ADD CONSTRAINT "campaign_intelligence_preferences_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;