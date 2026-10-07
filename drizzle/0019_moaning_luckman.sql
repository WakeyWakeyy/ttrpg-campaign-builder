CREATE TABLE "session_attendance" (
	"campaign_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"player_character_id" uuid NOT NULL,
	CONSTRAINT "session_attendance_session_id_player_character_id_pk" PRIMARY KEY("session_id","player_character_id")
);
--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "attendance_set" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "session_attendance" ADD CONSTRAINT "session_attendance_session_fk" FOREIGN KEY ("campaign_id","session_id") REFERENCES "public"."session"("campaign_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_attendance" ADD CONSTRAINT "session_attendance_player_character_fk" FOREIGN KEY ("campaign_id","player_character_id") REFERENCES "public"."player_character"("campaign_id","id") ON DELETE cascade ON UPDATE no action;