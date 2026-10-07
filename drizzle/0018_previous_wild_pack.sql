CREATE TABLE "scene" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"preparation" text,
	"outcome" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "scene_position_positive" CHECK ("scene"."position" > 0),
	CONSTRAINT "scene_title_nonempty" CHECK (length(btrim("scene"."title")) > 0)
);
--> statement-breakpoint
ALTER TABLE "scene" ADD CONSTRAINT "scene_session_fk" FOREIGN KEY ("campaign_id","session_id") REFERENCES "public"."session"("campaign_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scene_session_position_idx" ON "scene" USING btree ("session_id","position");