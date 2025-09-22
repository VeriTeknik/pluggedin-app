CREATE TABLE "server_reviews" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_source" "mcp_server_source" NOT NULL,
	"server_external_id" text NOT NULL,
	"user_id" text NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_reviews_unique_user_server_idx" UNIQUE("user_id","server_source","server_external_id")
);
--> statement-breakpoint
ALTER TABLE "server_reviews" ADD CONSTRAINT "server_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "server_reviews_source_external_id_idx" ON "server_reviews" USING btree ("server_source","server_external_id");--> statement-breakpoint
CREATE INDEX "server_reviews_user_id_idx" ON "server_reviews" USING btree ("user_id");