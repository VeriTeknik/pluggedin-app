DROP INDEX "oauth_clients_issuer_client_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_clients_issuer_client_id_idx" ON "oauth_clients" USING btree ("issuer","client_id");