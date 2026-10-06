CREATE TABLE "blueprint_draft" (
 "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
 "owner_user_id" uuid NOT NULL,
 "title" text NOT NULL,
 "premise" text NOT NULL,
 "setting" text,
 "tone" text,
 "proposed_locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
 "revision" integer DEFAULT 1 NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 CONSTRAINT "blueprint_draft_revision_positive" CHECK ("revision" > 0),
 CONSTRAINT "blueprint_draft_title_nonempty" CHECK (length(btrim("title")) > 0),
 CONSTRAINT "blueprint_draft_premise_nonempty" CHECK (length(btrim("premise")) > 0),
 CONSTRAINT "blueprint_draft_locations_array" CHECK (jsonb_typeof("proposed_locations") = 'array')
);
--> statement-breakpoint
ALTER TABLE "blueprint_draft" ADD CONSTRAINT "blueprint_draft_owner_user_id_user_account_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user_account"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "blueprint_draft_owner_idx" ON "blueprint_draft" USING btree ("owner_user_id");
