CREATE TABLE "event_photos" (
	"photo_id" text PRIMARY KEY,
	"caption" text DEFAULT '' NOT NULL,
	"blob_key" text NOT NULL,
	"content_type" text DEFAULT 'image/jpeg' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_reactions" (
	"id" serial PRIMARY KEY,
	"photo_id" text NOT NULL,
	"visitor_id" text NOT NULL,
	"liked" boolean DEFAULT false NOT NULL,
	"stars" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "photo_reactions_photo_visitor" UNIQUE("photo_id","visitor_id")
);
--> statement-breakpoint
ALTER TABLE "photo_reactions" ADD CONSTRAINT "photo_reactions_photo_id_event_photos_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "event_photos"("photo_id") ON DELETE CASCADE;