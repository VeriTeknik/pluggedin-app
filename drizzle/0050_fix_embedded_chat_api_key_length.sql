-- Fix embedded_chats api_key column length
-- The api_key format is 'ec_' + 64 hex characters = 66 total characters
ALTER TABLE "embedded_chats" 
ALTER COLUMN "api_key" TYPE varchar(66);