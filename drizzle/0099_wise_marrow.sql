ALTER TABLE "oauth_access_tokens" ADD COLUMN "family_id" uuid NOT NULL;--> statement-breakpoint
CREATE INDEX "oauth_access_tokens_family_idx" ON "oauth_access_tokens" USING btree ("family_id");