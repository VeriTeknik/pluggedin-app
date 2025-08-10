-- Increase custom_instructions character limit from implicit text to explicit longer text
-- This allows for more detailed persona and voice blueprints (3500 chars)
ALTER TABLE embedded_chats 
ALTER COLUMN custom_instructions TYPE text;

-- Note: text type in PostgreSQL can store up to 1GB, so 3500 chars is well within limits
-- The validation will be handled in the application layer