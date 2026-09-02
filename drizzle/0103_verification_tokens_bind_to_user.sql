-- Bind each verification token to the user it was issued for.
--
-- The table was keyed on (identifier, token) where identifier is the raw email,
-- and both verification paths resolved the account by that address — so a token
-- issued for one user verified whichever row currently held the email.
-- Registration replaces an unverified row with a new one under the same
-- address, which turned that into an account takeover.
--
-- The column is nullable on purpose. This table is also NextAuth's: the email
-- provider issues magic links for addresses that may not have a user yet, and
-- the adapter knows nothing about this column. Those rows keep a NULL user_id
-- and are consumed by NextAuth's own callback; the application's verification
-- routes require a user_id and refuse anything without one.
--
-- ON DELETE CASCADE is what makes the fix hold: a token cannot outlive the user
-- it was issued for, with no cleanup code left to forget to run.

ALTER TABLE "verification_tokens" ADD COLUMN "user_id" text;
--> statement-breakpoint
-- Backfill by the address each token was issued to, so nobody holding a link
-- loses it. At the time of writing all 114 rows match a user and none are still
-- live, so nothing in flight is disturbed.
UPDATE "verification_tokens" vt
   SET "user_id" = u."id"
  FROM "users" u
 WHERE u."email" = vt."identifier"
   AND vt."user_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_verification_tokens_user_id" ON "verification_tokens" USING btree ("user_id");