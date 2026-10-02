CREATE TABLE "users" (
	"user_id" text PRIMARY KEY,
	"full_name" text NOT NULL,
	"role" text NOT NULL,
	"team_id" text,
	"face_vector" jsonb NOT NULL,
	"photo" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performances" (
	"perf_id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"stage_name" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_events" (
	"id" serial PRIMARY KEY,
	"client_id" text NOT NULL UNIQUE,
	"device_id" text NOT NULL,
	"kind" text NOT NULL,
	"input" text NOT NULL,
	"outcome" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"scanned_at" text NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"team_id" text PRIMARY KEY,
	"team_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"ticket_hash" text PRIMARY KEY,
	"holder_name" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'unused' NOT NULL,
	"scanned_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_team_id_teams_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("team_id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "performances" ADD CONSTRAINT "performances_user_id_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE;