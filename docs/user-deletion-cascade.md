# User Account Deletion - GDPR Compliance

## Summary
Plugged.in is a trademark of VeriTeknik B.V. in the Netherlands and must comply with GDPR regulations. When a user account is deleted from the system, ALL related data must be completely removed to satisfy the "right to be forgotten" requirement.

**Status: ✅ GDPR Compliant** (after migration 0057_gdpr_cascade_fixes.sql)

## Tables with CASCADE DELETE (Data WILL be deleted)

When a user account is deleted, the following data is automatically deleted:

### Core User Data
1. **accounts** - OAuth provider accounts (Google, GitHub, Twitter)
2. **sessions** - Active login sessions
3. **password_reset_tokens** - Any pending password reset tokens
4. **projects** - All user projects
5. **profiles** - All profiles (via projects cascade)

### MCP Server Data (via profiles cascade)
6. **mcp_servers** - All MCP server configurations
7. **mcp_server_tools** - All tools
8. **mcp_server_prompts** - All prompts
9. **mcp_server_resources** - All resources
10. **mcp_server_resource_templates** - All resource templates
11. **mcp_server_environment_variables** - All environment variables
12. **custom_instructions** - All custom instructions

### Social Features
13. **followers** - All follower relationships (both following and being followed)
14. **shared_mcp_servers** - Shared server configurations (via profiles)
15. **shared_collections** - Shared collections (via profiles)
16. **mcp_activity** - MCP activity logs (via profiles)

### Document & RAG Data
17. **docs** - All uploaded documents
18. **doc_chunks** - Document chunks (via docs cascade)
19. **doc_embeddings** - Document embeddings (via docs cascade)

### Notifications
20. **notifications** - All notifications (via profiles)

### Email Tracking (New)
21. **email_tracking** - Email tracking data
22. **user_email_preferences** - Email preferences
23. **scheduled_emails** - Scheduled follow-up emails

### Registry
24. **registry_oauth_sessions** - Registry OAuth sessions
25. **registry_user_ratings** - User ratings for registry servers

## Previously Non-Compliant Tables (FIXED)

The following tables previously used `SET NULL` but have been updated to `CASCADE` for GDPR compliance:

### 1. **shared_mcp_servers.claimed_by_user_id** 
- ✅ **FIXED**: Now uses CASCADE DELETE
- When a user who claimed a shared MCP server is deleted, the entire shared server entry is deleted

### 2. **registry_servers.claimed_by_user_id**
- ✅ **FIXED**: Now uses CASCADE DELETE  
- When a user who claimed a registry server is deleted, the entire registry entry is deleted

## GDPR Compliance Features

### Complete Data Deletion
- All user data is permanently deleted when account is deleted
- No orphaned data remains in the system
- Full compliance with "right to be forgotten"

### Audit Trail
- Account deletion is logged with timestamp and IP address
- Admin notification sent for GDPR audit trail
- Detailed list of deleted data categories

### Implementation Details

The account deletion endpoint (`/api/settings/account`) now:
1. Logs GDPR compliance information before deletion
2. Deletes user avatar files from filesystem
3. Executes single DELETE on users table (CASCADE handles everything else)
4. Sends admin notification with full audit details
5. Clears all session cookies

## Migration Applied

```sql
-- Migration 0057_gdpr_cascade_fixes.sql
-- Changes SET NULL to CASCADE for complete GDPR compliance
ALTER TABLE shared_mcp_servers 
  ADD CONSTRAINT ... ON DELETE CASCADE;
  
ALTER TABLE registry_servers 
  ADD CONSTRAINT ... ON DELETE CASCADE;
```

## Testing Checklist

When implementing user deletion, test that:
- [ ] All projects are deleted
- [ ] All profiles are deleted
- [ ] All MCP servers and related data are deleted
- [ ] All documents and RAG data are deleted
- [ ] All notifications are deleted
- [ ] Email tracking data is deleted
- [ ] Follower relationships are removed
- [ ] OAuth accounts are removed
- [ ] Sessions are terminated
- [ ] Claimed servers are handled appropriately