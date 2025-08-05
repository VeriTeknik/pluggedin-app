ALTER TABLE "embedded_chats" ADD COLUMN "slug" varchar(100);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "website" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "location" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "company" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "twitter_handle" varchar(100);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "github_handle" varchar(100);