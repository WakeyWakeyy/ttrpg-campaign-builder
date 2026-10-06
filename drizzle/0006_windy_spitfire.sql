CREATE TABLE "blueprint_materialization" (
	"blueprint_id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"reviewed_revision" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blueprint_materialization_campaign_id_unique" UNIQUE("campaign_id"),
	CONSTRAINT "blueprint_materialization_revision_positive" CHECK ("blueprint_materialization"."reviewed_revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "blueprint_proposal" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"blueprint_id" uuid NOT NULL,
	"name" text NOT NULL,
	"decision" text DEFAULT 'PENDING' NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "blueprint_proposal_decision_check" CHECK ("blueprint_proposal"."decision" IN ('PENDING', 'ACCEPTED', 'REJECTED')),
	CONSTRAINT "blueprint_proposal_name_nonempty" CHECK (length(btrim("blueprint_proposal"."name")) > 0),
	CONSTRAINT "blueprint_proposal_order_positive" CHECK ("blueprint_proposal"."sort_order" > 0)
);
--> statement-breakpoint
ALTER TABLE "blueprint_materialization" ADD CONSTRAINT "blueprint_materialization_blueprint_id_blueprint_draft_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."blueprint_draft"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_materialization" ADD CONSTRAINT "blueprint_materialization_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_proposal" ADD CONSTRAINT "blueprint_proposal_blueprint_id_blueprint_draft_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."blueprint_draft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blueprint_proposal_blueprint_idx" ON "blueprint_proposal" USING btree ("blueprint_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blueprint_proposal_order_unique" ON "blueprint_proposal" USING btree ("blueprint_id","sort_order");