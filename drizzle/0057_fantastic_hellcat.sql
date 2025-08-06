ALTER TABLE "embedded_chats" ADD COLUMN "location" varchar(255);--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN "profession" varchar(255);--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN "expertise" text[] DEFAULT '{}'::text[];--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN "category" varchar(100);--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN "subcategory" varchar(100);--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN "language" varchar(10) DEFAULT 'en';--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN "timezone" varchar(50);--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN "industry" varchar(100);--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN "keywords" text[] DEFAULT '{}'::text[];--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN "company_name" varchar(255);--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN "company_size" varchar(50);--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN "target_audience" text[] DEFAULT '{}'::text[];--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN "service_hours" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN "response_time" varchar(50);--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN "pricing_model" varchar(50);--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN "semantic_tags" text[] DEFAULT '{}'::text[];--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN "use_cases" text[] DEFAULT '{}'::text[];--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN "capabilities_summary" text;--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN "personality_traits" text[] DEFAULT '{}'::text[];--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN "interaction_style" varchar(100);--> statement-breakpoint
CREATE INDEX "idx_embedded_chats_location" ON "embedded_chats" USING btree ("location");--> statement-breakpoint
CREATE INDEX "idx_embedded_chats_category" ON "embedded_chats" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_embedded_chats_language" ON "embedded_chats" USING btree ("language");--> statement-breakpoint
CREATE INDEX "idx_embedded_chats_industry" ON "embedded_chats" USING btree ("industry");