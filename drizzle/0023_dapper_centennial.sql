CREATE TABLE "encounter_run" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"source_campaign_id" uuid,
	"source_session_id" uuid,
	"placement_id" uuid,
	"encounter_id" uuid,
	"title" text NOT NULL,
	"outcome" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "encounter_run_source_scope" CHECK ((
    ("encounter_run"."source_campaign_id" IS NULL AND "encounter_run"."source_session_id" IS NULL
      AND "encounter_run"."placement_id" IS NULL AND "encounter_run"."encounter_id" IS NULL)
    OR ("encounter_run"."source_campaign_id" = "encounter_run"."campaign_id" AND "encounter_run"."source_session_id" = "encounter_run"."session_id"
      AND "encounter_run"."placement_id" IS NOT NULL AND "encounter_run"."encounter_id" IS NOT NULL)
  )),
	CONSTRAINT "encounter_run_title_nonempty" CHECK (length(btrim("encounter_run"."title")) > 0),
	CONSTRAINT "encounter_run_outcome_nonempty" CHECK (length(btrim("encounter_run"."outcome")) > 0)
);
--> statement-breakpoint
CREATE TABLE "encounter_run_creature" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"run_id" uuid NOT NULL,
	"name" text NOT NULL,
	"xp" integer NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "encounter_run_creature_name_nonempty" CHECK (length(btrim("encounter_run_creature"."name")) > 0),
	CONSTRAINT "encounter_run_creature_xp_nonnegative" CHECK ("encounter_run_creature"."xp" >= 0),
	CONSTRAINT "encounter_run_creature_quantity_positive" CHECK ("encounter_run_creature"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "encounter_run" ADD CONSTRAINT "encounter_run_session_fk" FOREIGN KEY ("campaign_id","session_id") REFERENCES "public"."session"("campaign_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "encounter_placement_run_source_unique" ON "encounter_placement" USING btree ("campaign_id","session_id","id","encounter_id");
--> statement-breakpoint
ALTER TABLE "encounter_run" ADD CONSTRAINT "encounter_run_source_fk" FOREIGN KEY ("source_campaign_id","source_session_id","placement_id","encounter_id") REFERENCES "public"."encounter_placement"("campaign_id","session_id","id","encounter_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounter_run_creature" ADD CONSTRAINT "encounter_run_creature_run_fk" FOREIGN KEY ("run_id") REFERENCES "public"."encounter_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "encounter_run_session_idx" ON "encounter_run" USING btree ("session_id","occurred_at");--> statement-breakpoint
CREATE INDEX "encounter_run_creature_run_idx" ON "encounter_run_creature" USING btree ("run_id");--> statement-breakpoint
