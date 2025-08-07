ALTER TABLE "embedded_chats" ADD COLUMN IF NOT EXISTS "debug_mode" boolean DEFAULT false;

ALTER TABLE "embedded_chats" ALTER COLUMN "model_config" SET DEFAULT '{
      "provider": "openai",
      "model": "gpt-4o-mini",
      "temperature": 0.7,
      "max_tokens": 1000,
      "top_p": 1.0,
      "frequency_penalty": 0.0,
      "presence_penalty": 0.0
    }'::jsonb;