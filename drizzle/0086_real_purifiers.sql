ALTER TABLE "agents" ADD COLUMN "model_router_service_uuid" uuid;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "model_router_token" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "model_router_token_issued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "model_router_token_revoked" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_model_router_service_uuid_model_router_services_uuid_fk" FOREIGN KEY ("model_router_service_uuid") REFERENCES "public"."model_router_services"("uuid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agents_model_router_service_uuid_idx" ON "agents" USING btree ("model_router_service_uuid");