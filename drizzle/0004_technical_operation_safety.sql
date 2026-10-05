CREATE TABLE "change_set" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reverted_at" timestamp with time zone,
	"reverted_by_user_id" uuid,
	CONSTRAINT "change_set_kind_nonempty" CHECK (length(btrim("change_set"."kind")) > 0),
	CONSTRAINT "change_set_reverted_pair_check" CHECK (("change_set"."reverted_at" IS NULL) = ("change_set"."reverted_by_user_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "change_set_entry" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"change_set_id" uuid NOT NULL,
	"entity_id" uuid,
	"object_kind" text NOT NULL,
	"object_id" uuid,
	"operation" text NOT NULL,
	"snapshot_schema_version" integer DEFAULT 1 NOT NULL,
	"before_json" jsonb,
	"after_json" jsonb,
	"expected_current_revision" integer,
	"apply_order" integer NOT NULL,
	CONSTRAINT "change_set_entry_object_kind_nonempty" CHECK (length(btrim("change_set_entry"."object_kind")) > 0),
	CONSTRAINT "change_set_entry_object_identity_check" CHECK ("change_set_entry"."entity_id" IS NOT NULL OR "change_set_entry"."object_id" IS NOT NULL),
	CONSTRAINT "change_set_entry_snapshot_schema_version_positive" CHECK ("change_set_entry"."snapshot_schema_version" > 0),
	CONSTRAINT "change_set_entry_expected_current_revision_positive" CHECK ("change_set_entry"."expected_current_revision" > 0),
	CONSTRAINT "change_set_entry_apply_order_positive" CHECK ("change_set_entry"."apply_order" > 0),
	CONSTRAINT "change_set_entry_before_object_check" CHECK (jsonb_typeof("change_set_entry"."before_json") = 'object'),
	CONSTRAINT "change_set_entry_after_object_check" CHECK (jsonb_typeof("change_set_entry"."after_json") = 'object'),
	CONSTRAINT "change_set_entry_operation_snapshot_check" CHECK (
    ("change_set_entry"."operation" = 'INSERT' AND "change_set_entry"."before_json" IS NULL AND "change_set_entry"."after_json" IS NOT NULL) OR
    ("change_set_entry"."operation" = 'UPDATE' AND "change_set_entry"."before_json" IS NOT NULL AND "change_set_entry"."after_json" IS NOT NULL) OR
    ("change_set_entry"."operation" = 'DELETE' AND "change_set_entry"."before_json" IS NOT NULL AND "change_set_entry"."after_json" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "command_execution" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"scope_user_id" uuid NOT NULL,
	"scope_campaign_id" uuid,
	"command_kind" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"status" text NOT NULL,
	"result_schema_version" integer,
	"result_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "command_execution_status_check" CHECK ("command_execution"."status" IN ('IN_PROGRESS', 'SUCCEEDED')),
	CONSTRAINT "command_execution_command_kind_nonempty" CHECK (length(btrim("command_execution"."command_kind")) > 0),
	CONSTRAINT "command_execution_idempotency_key_nonempty" CHECK (length(btrim("command_execution"."idempotency_key")) > 0),
	CONSTRAINT "command_execution_request_fingerprint_nonempty" CHECK (length(btrim("command_execution"."request_fingerprint")) > 0),
	CONSTRAINT "command_execution_result_schema_version_positive" CHECK ("command_execution"."result_schema_version" > 0),
	CONSTRAINT "command_execution_completion_check" CHECK (
    ("command_execution"."status" = 'IN_PROGRESS' AND "command_execution"."completed_at" IS NULL) OR
    ("command_execution"."status" = 'SUCCEEDED' AND "command_execution"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "change_set" ADD CONSTRAINT "change_set_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_set" ADD CONSTRAINT "change_set_created_by_user_id_user_account_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_set" ADD CONSTRAINT "change_set_reverted_by_user_id_user_account_id_fk" FOREIGN KEY ("reverted_by_user_id") REFERENCES "public"."user_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_set_entry" ADD CONSTRAINT "change_set_entry_change_set_id_change_set_id_fk" FOREIGN KEY ("change_set_id") REFERENCES "public"."change_set"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "command_execution" ADD CONSTRAINT "command_execution_scope_user_id_user_account_id_fk" FOREIGN KEY ("scope_user_id") REFERENCES "public"."user_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "command_execution" ADD CONSTRAINT "command_execution_scope_campaign_id_campaign_id_fk" FOREIGN KEY ("scope_campaign_id") REFERENCES "public"."campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "change_set_entry_apply_order_unique" ON "change_set_entry" USING btree ("change_set_id","apply_order");--> statement-breakpoint
CREATE UNIQUE INDEX "command_execution_user_idempotency_unique" ON "command_execution" USING btree ("scope_user_id","command_kind","idempotency_key") WHERE "command_execution"."scope_campaign_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "command_execution_campaign_idempotency_unique" ON "command_execution" USING btree ("scope_user_id","scope_campaign_id","command_kind","idempotency_key") WHERE "command_execution"."scope_campaign_id" IS NOT NULL;