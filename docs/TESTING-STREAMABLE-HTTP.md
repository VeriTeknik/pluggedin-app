# Testing Streamable HTTP Implementation

This guide explains how to test the new Streamable HTTP support in pluggedin-app.

## Quick Start

### 1. Run the Quick Connection Test

```bash
pnpm tsx scripts/quick-test-streamable.ts
```

This will test connections to known Streamable HTTP servers and show CORS detection results.

### 2. Run Unit Tests

```bash
pnpm test tests/unit/session-management.test.ts
```

This tests the session management implementation including:
- Session ID generation (MCP spec compliant)
- Session storage and retrieval
- Session expiry handling
- Cache management

## Manual Testing

### 1. Test via UI

1. Start the development server:
   ```bash
   pnpm dev
   ```

2. Navigate to MCP Servers page

3. Click "Add Server" and select "Streamable HTTP" as the type

4. Enter one of these test URLs:
   - `https://mcp.context7.com` (Context7 Documentation)
   - `https://server.smithery.ai/v1` (Smithery AI)

5. Click "Test Connection" - you should see:
   - Success message with capabilities
   - OR CORS error with specific guidance

### 2. Test Session Management

To verify session capture and persistence:

1. First, find your profile UUID:
   ```bash
   psql $DATABASE_URL -c "SELECT uuid, name FROM profiles WHERE project_uuid IN (SELECT uuid FROM projects WHERE user_id = (SELECT id FROM users WHERE email = 'your-email@example.com'));"
   ```

2. Set the environment variable:
   ```bash
   export TEST_PROFILE_UUID=your-profile-uuid-here
   ```

3. Run the comprehensive test:
   ```bash
   pnpm tsx scripts/test-streamable-http.ts
   ```

This will:
- Create a test server
- Capture session IDs
- Verify session persistence
- Test session reuse
- Clean up afterwards

### 3. Test API Endpoint

The `/api/mcp` endpoint can be tested with curl:

1. Get your authentication token:
   - Open pluggedin-app in browser
   - Open DevTools → Application → Cookies
   - Copy the `next-auth.session-token` value

2. Test the initialize method:
   ```bash
   curl -X POST http://localhost:12005/api/mcp \
     -H "Content-Type: application/json" \
     -H "Cookie: next-auth.session-token=YOUR_TOKEN_HERE" \
     -H "X-MCP-Server-UUID: test-server-uuid" \
     -H "X-MCP-Profile-UUID: your-profile-uuid" \
     -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05"},"id":1}'
   ```

3. Look for the `Mcp-Session-Id` header in the response

### 4. Test CORS Detection

Test how the system handles various CORS scenarios:

```bash
# Test server without CORS headers
curl -X POST http://localhost:12005/app/actions/test-mcp-connection \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Server",
    "type": "STREAMABLE_HTTP",
    "url": "https://example.com/mcp"
  }'
```

Expected CORS detection messages:
- Missing `Access-Control-Allow-Origin`
- Missing `Access-Control-Expose-Headers: Mcp-Session-Id`
- 400 Bad Request with session-related errors

## Debugging

### Check Session Storage

View stored sessions in the database:

```sql
-- View all sessions
SELECT id, server_uuid, profile_uuid, created_at, expires_at 
FROM mcp_sessions 
ORDER BY created_at DESC;

-- View sessions for a specific server
SELECT * FROM mcp_sessions 
WHERE server_uuid = 'your-server-uuid';

-- Check expired sessions
SELECT COUNT(*) as expired_count 
FROM mcp_sessions 
WHERE expires_at < NOW();
```

### Enable Debug Logging

The implementation includes console logs for debugging. Look for:
- `[StreamableHTTPWrapper]` - Session capture and reuse
- `[MCP Wrapper]` - Transport creation
- `[MCP API]` - API endpoint operations
- `[StreamableHTTP Handler]` - Request routing

### Common Issues

1. **"Missing Mcp-Session-Id header"**
   - Server needs to include `Access-Control-Expose-Headers: Mcp-Session-Id`
   - Check server's CORS configuration

2. **"Invalid or expired session"**
   - Session has expired (default 1 hour TTL)
   - Run cleanup: `psql $DATABASE_URL -c "DELETE FROM mcp_sessions WHERE expires_at < NOW();"`

3. **"Failed to connect to MCP server"**
   - Check if server URL is accessible
   - Verify CORS headers are properly configured
   - Try with curl to see raw response

## Test Servers

Known Streamable HTTP servers for testing:

| Server | URL | Notes |
|--------|-----|-------|
| Context7 | https://mcp.context7.com | Documentation server |
| Smithery | https://server.smithery.ai/v1 | AI tools |
| GitHub Copilot | https://api.githubcopilot.com | Requires auth |

## Next Steps

After testing:

1. **Update UI**: The discovery wizard needs updates to support Streamable HTTP configuration
2. **Add More Tests**: Create integration tests for real server interactions
3. **Documentation**: Update user docs with Streamable HTTP setup instructions
4. **Error Messages**: Improve user-facing error messages based on test results