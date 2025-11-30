CREATE TYPE "public"."blog_post_category" AS ENUM('announcement', 'technical', 'product', 'tutorial', 'case-study');--> statement-breakpoint
CREATE TYPE "public"."blog_post_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "blog_post_translations" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blog_post_uuid" uuid NOT NULL,
	"language" "language" NOT NULL,
	"title" text NOT NULL,
	"excerpt" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blog_post_translations_unique" UNIQUE("blog_post_uuid","language")
);
--> statement-breakpoint
CREATE TABLE "blog_posts" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" text NOT NULL,
	"slug" text NOT NULL,
	"status" "blog_post_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"category" "blog_post_category" NOT NULL,
	"tags" text[] DEFAULT '{}'::text[],
	"header_image_url" text,
	"header_image_alt" text,
	"meta_title" text,
	"meta_description" text,
	"og_image_url" text,
	"reading_time_minutes" integer,
	"view_count" integer DEFAULT 0 NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blog_posts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "blog_post_translations" ADD CONSTRAINT "blog_post_translations_blog_post_uuid_blog_posts_uuid_fk" FOREIGN KEY ("blog_post_uuid") REFERENCES "public"."blog_posts"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blog_post_translations_blog_post_idx" ON "blog_post_translations" USING btree ("blog_post_uuid");--> statement-breakpoint
CREATE INDEX "blog_post_translations_language_idx" ON "blog_post_translations" USING btree ("language");--> statement-breakpoint
CREATE INDEX "blog_posts_slug_idx" ON "blog_posts" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "blog_posts_author_idx" ON "blog_posts" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "blog_posts_status_idx" ON "blog_posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "blog_posts_category_idx" ON "blog_posts" USING btree ("category");--> statement-breakpoint
CREATE INDEX "blog_posts_published_at_idx" ON "blog_posts" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "blog_posts_featured_idx" ON "blog_posts" USING btree ("is_featured");