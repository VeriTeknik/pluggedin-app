# Analytics Tracking Test Guide

## Current Implementation Status

### ✅ What's Implemented:

1. **Installation Tracking**
   - When a server is installed via `createMcpServer`, it calls `trackServerInstallation`
   - `trackServerInstallation` now sends events to analytics service
   - Events include: server_id, user_id, source

2. **Uninstallation Tracking** 
   - When a server is deleted via `deleteMcpServerByUuid`, it now tracks uninstalls
   - Events include: server_id, user_id, reason: 'user_deleted'

3. **MCP Activity Tracking**
   - ALL MCP operations (tool_call, prompt_get, resource_read) are tracked
   - Both successful and failed operations are sent to analytics
   - Events include: server_id, user_id, tool_name, duration, success, error

4. **Rating Tracking**
   - Ratings are sent to registry VP endpoint
   - Also tracked as events to analytics service

5. **Comment Tracking**
   - Comments are sent to analytics API
   - Tracked as comment events

### ❌ What's NOT Implemented:

1. **View Tracking**
   - `trackView` function exists but is never called
   - No tracking when users browse or view server details

2. **Share Tracking**
   - `trackShare` function exists but likely not called

3. **Claim Tracking**
   - `trackClaim` function exists but needs verification

## Testing Steps

### 1. Test Installation Tracking
```bash
# Install a registry server (e.g., filesystem)
# Check Elastic for:
# - event_type: "install"
# - server_id: <filesystem-id>
# - client_id: "pluggedin-app"
# - user_id: <your-user-id>
```

### 2. Test Uninstallation Tracking
```bash
# Delete the installed server
# Check Elastic for:
# - event_type: "uninstall"
# - server_id: <filesystem-id>
# - client_id: "pluggedin-app"
# - user_id: <your-user-id>
# - metadata.reason: "user_deleted"
```

### 3. Test MCP Activity Tracking
```bash
# Use a tool from the filesystem server
# Check Elastic for:
# - event_type: "usage"
# - server_id: <server-uuid>
# - client_id: "pluggedin-app"
# - metadata.action: "tool_call"
# - metadata.toolName: <tool-name>
# - metadata.success: true/false
```

### 4. Test Rating/Comment Tracking
```bash
# Rate a server with a comment
# Check Elastic for:
# - event_type: "rating"
# - server_id: <server-id>
# - metadata.rating: <1-5>
# And potentially:
# - event_type: "comment"
# - metadata.comment: <your-comment>
```

## Expected Event Format in Elastic

```json
{
  "event_type": "install|uninstall|usage|error|view|rating|comment",
  "server_id": "server-uuid-or-external-id",
  "client_id": "pluggedin-app",
  "user_id": "user-id-or-anonymous",
  "session_id": "session-timestamp",
  "timestamp": "2025-07-04T...",
  "metadata": {
    "source": "registry|community|pluggedin",
    "profileId": "profile-uuid",
    "serverName": "server-name",
    "action": "tool_call|prompt_get|resource_read",
    "toolName": "tool-name",
    "success": true/false,
    "duration": 123,
    "error": "error-message-if-failed"
  }
}
```

## Debugging Tips

1. Check browser console for any "Failed to track" errors
2. Check server logs for analytics API errors
3. Verify ANALYTICS_API_URL is set correctly
4. Ensure analytics.plugged.in is accessible
5. Check if events are being batched (5 second delay)

## Known Issues

1. Client-side `useAnalytics` hook is deprecated and does nothing
2. View tracking is not implemented
3. Some UI components might still use the deprecated hook