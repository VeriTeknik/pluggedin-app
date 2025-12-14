-- AI Models Table Migration
-- Model Router Configuration for multi-provider AI model management

-- Create model provider enum
CREATE TYPE "model_provider" AS ENUM('openai', 'anthropic', 'google', 'xai', 'deepseek');

-- Create AI models table
CREATE TABLE IF NOT EXISTS "ai_models" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	-- Identity
	"model_id" text NOT NULL UNIQUE,
	"display_name" text NOT NULL,
	"provider" "model_provider" NOT NULL,
	-- Pricing (per 1M tokens in USD)
	"input_price" real NOT NULL,
	"output_price" real NOT NULL,
	-- Capabilities
	"context_length" integer DEFAULT 128000,
	"supports_streaming" boolean DEFAULT true,
	"supports_vision" boolean DEFAULT false,
	"supports_function_calling" boolean DEFAULT true,
	-- Configuration
	"is_enabled" boolean DEFAULT true,
	"is_default" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	-- Aliases
	"aliases" text[],
	-- Metadata
	"description" text,
	"release_date" date,
	"deprecated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "ai_models_model_id_idx" ON "ai_models" ("model_id");
CREATE INDEX IF NOT EXISTS "ai_models_provider_idx" ON "ai_models" ("provider");
CREATE INDEX IF NOT EXISTS "ai_models_enabled_idx" ON "ai_models" ("is_enabled");
CREATE INDEX IF NOT EXISTS "ai_models_provider_enabled_idx" ON "ai_models" ("provider", "is_enabled", "sort_order");

-- Seed with initial models (December 2025 pricing from OpenRouter/providers)
INSERT INTO "ai_models" (
	"model_id", "display_name", "provider", "input_price", "output_price",
	"context_length", "supports_vision", "is_default", "sort_order", "description"
) VALUES
-- ═══════════════════════════════════════════════════════════════════════
-- OpenAI Models (openai.com/api/pricing)
-- ═══════════════════════════════════════════════════════════════════════
('gpt-5', 'GPT-5', 'openai', 1.25, 10.00, 272000, true, false, 10, 'Latest OpenAI flagship model'),
('gpt-5-mini', 'GPT-5 Mini', 'openai', 0.25, 2.00, 272000, false, false, 11, 'Efficient version of GPT-5'),
('gpt-5-nano', 'GPT-5 Nano', 'openai', 0.05, 0.40, 128000, false, false, 12, 'Lightweight budget model'),
('gpt-4o', 'GPT-4o', 'openai', 2.50, 10.00, 128000, true, false, 20, 'GPT-4 Omni - multimodal'),
('gpt-4o-mini', 'GPT-4o Mini', 'openai', 0.15, 0.60, 128000, false, false, 21, 'Efficient GPT-4o variant'),
('gpt-4.1', 'GPT-4.1', 'openai', 2.00, 8.00, 128000, true, false, 22, 'GPT-4.1 with improvements'),
('gpt-4.1-mini', 'GPT-4.1 Mini', 'openai', 0.40, 1.60, 128000, false, false, 23, 'Efficient GPT-4.1'),
('o1', 'o1 (Reasoning)', 'openai', 15.00, 60.00, 200000, false, false, 30, 'OpenAI reasoning model'),
('o1-mini', 'o1 Mini', 'openai', 3.00, 12.00, 128000, false, false, 31, 'Efficient reasoning model'),

-- ═══════════════════════════════════════════════════════════════════════
-- Anthropic Models (anthropic.com/pricing)
-- ═══════════════════════════════════════════════════════════════════════
('claude-opus-4-5-20251101', 'Claude Opus 4.5', 'anthropic', 5.00, 25.00, 200000, true, true, 100, 'Latest Claude flagship - most capable'),
('claude-sonnet-4-5-20251022', 'Claude Sonnet 4.5', 'anthropic', 3.00, 15.00, 200000, true, false, 101, 'Balanced Claude model'),
('claude-opus-4-1-20250805', 'Claude Opus 4.1', 'anthropic', 15.00, 75.00, 200000, true, false, 102, 'Previous flagship version'),
('claude-sonnet-4-20250514', 'Claude Sonnet 4', 'anthropic', 3.00, 15.00, 200000, true, false, 103, 'Previous Sonnet version'),
('claude-3-haiku-20240307', 'Claude 3 Haiku', 'anthropic', 0.25, 1.25, 200000, false, false, 110, 'Fast and affordable'),

-- ═══════════════════════════════════════════════════════════════════════
-- Google Models (ai.google.dev/gemini-api/docs/pricing)
-- ═══════════════════════════════════════════════════════════════════════
('gemini-2.5-pro', 'Gemini 2.5 Pro', 'google', 1.25, 10.00, 1050000, true, false, 200, 'Google flagship model'),
('gemini-2.5-flash', 'Gemini 2.5 Flash', 'google', 0.30, 2.50, 1000000, true, false, 201, 'Fast Gemini variant'),
('gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite', 'google', 0.10, 0.40, 1000000, false, false, 202, 'Budget Gemini'),
('gemini-2.0-flash', 'Gemini 2.0 Flash', 'google', 0.10, 0.40, 1000000, true, false, 203, 'Previous Flash version'),
('gemini-1.5-pro', 'Gemini 1.5 Pro', 'google', 1.25, 5.00, 2000000, true, false, 210, 'Largest context window'),

-- ═══════════════════════════════════════════════════════════════════════
-- xAI Models (x.ai/api)
-- ═══════════════════════════════════════════════════════════════════════
('grok-4', 'Grok 4', 'xai', 3.00, 15.00, 128000, false, false, 300, 'Latest Grok model'),
('grok-3', 'Grok 3', 'xai', 3.00, 15.00, 128000, false, false, 301, 'Previous Grok version'),

-- ═══════════════════════════════════════════════════════════════════════
-- DeepSeek Models (deepseek.com) - Budget option
-- ═══════════════════════════════════════════════════════════════════════
('deepseek-v3', 'DeepSeek V3', 'deepseek', 0.14, 0.28, 256000, false, false, 400, 'Budget high-performance model'),
('deepseek-v3-1', 'DeepSeek V3.1', 'deepseek', 0.14, 0.28, 256000, false, false, 401, 'Latest DeepSeek')

ON CONFLICT (model_id) DO NOTHING;
