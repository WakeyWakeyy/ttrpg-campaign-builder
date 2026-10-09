CREATE TABLE "encounter_placement" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"scene_id" uuid,
	"encounter_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "scene_campaign_session_id_unique" ON "scene" USING btree ("campaign_id","session_id","id");--> statement-breakpoint
ALTER TABLE "encounter_placement" ADD CONSTRAINT "encounter_placement_session_fk" FOREIGN KEY ("campaign_id","session_id") REFERENCES "public"."session"("campaign_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounter_placement" ADD CONSTRAINT "encounter_placement_scene_fk" FOREIGN KEY ("campaign_id","session_id","scene_id") REFERENCES "public"."scene"("campaign_id","session_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounter_placement" ADD CONSTRAINT "encounter_placement_encounter_fk" FOREIGN KEY ("campaign_id","encounter_id") REFERENCES "public"."encounter"("campaign_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "encounter_placement_session_idx" ON "encounter_placement" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "encounter_placement_encounter_idx" ON "encounter_placement" USING btree ("encounter_id");--> statement-breakpoint
