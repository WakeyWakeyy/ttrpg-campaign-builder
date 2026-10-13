CREATE TABLE "secret_knowledge" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"secret_id" uuid NOT NULL,
	"holder_id" uuid NOT NULL,
	"holder_type" text NOT NULL,
	"state" text NOT NULL,
	"notes" text,
	CONSTRAINT "secret_knowledge_holder_type_check" CHECK ("secret_knowledge"."holder_type" IN ('PLAYER_CHARACTER', 'NPC', 'PARTY', 'FACTION')),
	CONSTRAINT "secret_knowledge_state_check" CHECK ("secret_knowledge"."state" IN ('SUSPECTED', 'PARTIAL', 'KNOWN'))
);
--> statement-breakpoint
ALTER TABLE "secret_knowledge" ADD CONSTRAINT "secret_knowledge_secret_fk" FOREIGN KEY ("campaign_id","secret_id") REFERENCES "public"."secret"("campaign_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_knowledge" ADD CONSTRAINT "secret_knowledge_holder_fk" FOREIGN KEY ("campaign_id","holder_id","holder_type") REFERENCES "public"."campaign_entity"("campaign_id","id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "secret_knowledge_holder_unique" ON "secret_knowledge" USING btree ("secret_id","holder_id");--> statement-breakpoint
CREATE INDEX "secret_knowledge_campaign_idx" ON "secret_knowledge" USING btree ("campaign_id");
