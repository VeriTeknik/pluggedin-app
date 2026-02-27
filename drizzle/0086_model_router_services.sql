-- Migration: Add Model Router Services tables
-- This migration creates tables for dynamic service management:
-- 1. model_router_services - Registry of model router microservices
-- 2. model_service_mappings - Junction table linking models to services

-- Create enums for health status and sync status
DO $$ BEGIN
    CREATE TYPE "service_health_status" AS ENUM ('healthy', 'unhealthy', 'degraded', 'unknown');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "model_sync_status" AS ENUM ('synced', 'pending', 'partial', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create model_router_services table
CREATE TABLE IF NOT EXISTS "model_router_services" (
    "uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,

    -- Identity
    "name" text NOT NULL,
    "url" text NOT NULL UNIQUE,
    "region" text,

    -- Endpoints
    "health_endpoint" text DEFAULT '/health',
    "models_endpoint" text DEFAULT '/v1/models',
    "sync_endpoint" text DEFAULT '/v1/models/sync',
    "metrics_endpoint" text DEFAULT '/metrics',

    -- Capabilities
    "capabilities" text[],

    -- Authentication
    "auth_type" text DEFAULT 'jwt',
    "auth_secret_name" text,

    -- Health & Performance
    "is_enabled" boolean DEFAULT true,
    "health_status" "service_health_status" DEFAULT 'unknown',
    "last_health_check" timestamp with time zone,
    "last_health_error" text,
    "avg_latency_ms" integer,
    "current_load_percent" integer,
    "success_rate_percent" real,

    -- Routing
    "priority" integer DEFAULT 100,
    "weight" integer DEFAULT 100,

    -- Model sync
    "last_model_sync" timestamp with time zone,
    "model_sync_status" "model_sync_status" DEFAULT 'pending',

    -- Metadata
    "description" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Create model_service_mappings table
CREATE TABLE IF NOT EXISTS "model_service_mappings" (
    "uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,

    -- Foreign keys
    "model_uuid" uuid NOT NULL REFERENCES "ai_models"("uuid") ON DELETE CASCADE,
    "service_uuid" uuid NOT NULL REFERENCES "model_router_services"("uuid") ON DELETE CASCADE,

    -- Configuration
    "is_enabled" boolean DEFAULT true,
    "priority" integer DEFAULT 100,

    -- Stats
    "requests_total" integer DEFAULT 0,
    "errors_total" integer DEFAULT 0,
    "avg_latency_ms" integer,

    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Create indexes for model_router_services
CREATE INDEX IF NOT EXISTS "model_router_services_url_idx" ON "model_router_services" ("url");
CREATE INDEX IF NOT EXISTS "model_router_services_region_idx" ON "model_router_services" ("region");
CREATE INDEX IF NOT EXISTS "model_router_services_health_idx" ON "model_router_services" ("is_enabled", "health_status");
CREATE INDEX IF NOT EXISTS "model_router_services_enabled_healthy_idx" ON "model_router_services" ("is_enabled", "health_status", "priority");

-- Create indexes for model_service_mappings
CREATE INDEX IF NOT EXISTS "model_service_mappings_model_idx" ON "model_service_mappings" ("model_uuid");
CREATE INDEX IF NOT EXISTS "model_service_mappings_service_idx" ON "model_service_mappings" ("service_uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "model_service_mappings_unique_idx" ON "model_service_mappings" ("model_uuid", "service_uuid");
CREATE INDEX IF NOT EXISTS "model_service_mappings_routing_idx" ON "model_service_mappings" ("model_uuid", "is_enabled", "priority");

-- Add comment for documentation
COMMENT ON TABLE "model_router_services" IS 'Registry of model router microservices for dynamic LLM routing';
COMMENT ON TABLE "model_service_mappings" IS 'Junction table linking AI models to router services that support them';
