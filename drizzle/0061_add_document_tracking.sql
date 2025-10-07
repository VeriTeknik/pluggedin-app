-- Add document access tracking to mcp_activity
-- The action column already supports text values, so we can use new action types
-- without schema changes. This migration documents the new action types.

-- New action types for document tracking:
-- 'document_view' - When a document is viewed in the library
-- 'document_rag_query' - When a document is retrieved via RAG query
-- 'document_download' - When a document is downloaded (future use)

-- These new actions will be tracked with:
-- - profile_uuid: The profile performing the action
-- - item_name: The document UUID being accessed
-- - action: One of the new document action types
-- - created_at: Timestamp of the access

-- Update comment to document all supported action types
COMMENT ON COLUMN mcp_activity.action IS
'Action type: install, uninstall, tool_call, resource_read, prompt_get, document_view, document_rag_query, document_download';