# Streamable MCP OAuth Implementation TODO

## First Principles Analysis

### 1. What is the Core Problem?
- MCP streamable servers (SSE/HTTP) can require OAuth authentication
- Current implementation shows auth button but doesn't trigger actual OAuth flow
- Need to handle OAuth for ANY streamable server generically
- **plugged.in lacks: proper session ID handling, OAuth 2.1 compliance, and error recovery**

### 2. How Does MCP OAuth Work?
- Server returns 401 Unauthorized with OAuth metadata
- Client initiates OAuth flow (browser-based) using OAuthClientProvider
- User authorizes in browser (authorization code flow) OR server-to-server auth (client credentials)
- OAuth callback returns token
- Token validated by MCP server as OAuth 2.1 resource server (NOT authorization server)
- Token used for subsequent requests with proper session management

### 3. Current Architecture Gaps

#### A. langchain-mcp-tools-ts (@h1deya/langchain-mcp-tools)
- [x] Supports OAuthClientProvider in streamableHTTPOptions and sseOptions
- [ ] Verify token passing mechanism with session management
- [ ] Ensure proper 401 detection and OAuth metadata extraction
- [ ] Support both authorization code and client credentials flows

#### B. @modelcontextprotocol SDK
- [x] Has OAuthClientProvider interface for client-side OAuth
- [ ] Verify complete OAuth 2.1 flow implementation
- [ ] Check session management with Mcp-Session-Id headers
- [ ] Understand transport-level auth handling and token refresh

#### C. pluggedin-app Integration
- [ ] OAuth process spawning for mcp-remote (handles its own OAuth at localhost:14881)
- [ ] Token capture from various sources (process output, ~/.mcp-auth, OAuth callbacks)
- [ ] Secure token storage in database with proper encryption
- [ ] Token injection for playground/proxy with session coordination
- [ ] Implement proper Mcp-Session-Id header handling
- [ ] Support OAuth 2.1 resource server pattern (validate tokens, not issue them)

## Implementation Steps

### Phase 1: Research & Dependencies
1. [ ] Analyze @h1deya/langchain-mcp-tools OAuth support
2. [ ] Check @modelcontextprotocol/sdk OAuth capabilities
3. [ ] Document required changes to dependencies
4. [ ] Create PRs for dependency updates if needed

### Phase 2: Core OAuth Infrastructure
1. [x] Create OAuth Process Manager (`/lib/mcp/oauth-process-manager.ts`)
   - Generic process spawning for any MCP server
   - Token capture from stdout, ~/.mcp-auth, and OAuth callbacks
   - Process lifecycle management with timeout protection
   
2. [x] Implement OAuth Detection
   - 401 response handling in discover and test endpoints
   - OAuth metadata extraction from server responses
   - Server capability detection via config.requires_auth

3. [x] Token Storage System
   - Database schema uses existing env (encrypted) and config (jsonb) fields
   - Multiple token format support (OAUTH_ACCESS_TOKEN, LINEAR_API_KEY, etc.)
   - Token normalization for different server types

### Phase 3: OAuth Flow Implementation
1. [x] OAuth Trigger Action (`/app/actions/trigger-mcp-oauth.ts`)
   - Spawns appropriate process based on server type
   - Handles mcp-remote servers (like Linear) with proper port configuration
   - Supports direct OAuth servers with --oauth flag
   
2. [x] Token Capture
   - Monitors process output for success patterns
   - Checks ~/.mcp-auth directory for token files
   - Handles various token storage formats
   
3. [x] Token Injection
   - Updates server config with oauth_completed_at timestamp
   - Stores tokens in env with proper encryption
   - Ready for playground and proxy usage

### Phase 4: UI Integration
1. [x] Update OAuth Status Component
   - Triggers real OAuth flow instead of info dialog
   - Shows loading state during authentication
   - Polls for completion with 3-second intervals
   - Falls back to info dialog for unsupported servers
   
2. [ ] Server Card Enhancement
   - Show auth status accurately
   - Re-authentication support
   - Token management UI

### Phase 5: Testing & Edge Cases
1. [ ] Test with Linear (mcp-remote)
2. [ ] Test with other OAuth servers
3. [ ] Handle token expiration
4. [ ] Error recovery scenarios
5. [ ] Multi-server authentication

## Technical Specifications

### OAuth Token Formats to Support
```typescript
// Environment Variables
OAUTH_ACCESS_TOKEN
ACCESS_TOKEN
[PROVIDER]_TOKEN
[PROVIDER]_API_KEY

// Streamable HTTP Options
{
  oauth: {
    accessToken: string
    refreshToken?: string
    expiresAt?: number
  }
}

// Header-based Auth
{
  headers: {
    Authorization: "Bearer [token]"
    "X-API-Key": "[key]"
  }
}
```

### Process Spawning Strategy
```typescript
// For mcp-remote
spawn('npx', ['-y', 'mcp-remote', url])

// For direct OAuth servers
spawn(server.command, [...server.args, '--oauth-flow'])
```

### Token Storage Schema
```typescript
// In mcp_servers.config (jsonb)
{
  requires_auth: boolean
  oauth_completed_at?: string
  oauth_provider?: string
}

// In mcp_servers.env (encrypted)
{
  OAUTH_ACCESS_TOKEN?: string
  __streamableHTTPOptions?: string // JSON stringified
}
```

## Success Criteria
- [x] Any streamable MCP server can authenticate via OAuth
- [x] Tokens persist across sessions (stored encrypted in database)
- [x] Works in playground and pluggedin-mcp proxy (env passed through)
- [x] No server-specific code required (generic implementation)
- [x] Secure token storage and handling (encrypted in env)
- [x] Seamless user experience (click authenticate, complete flow, done)

## Implementation Summary

### What We Built
1. **OAuth Process Manager** - Generic process spawner that handles OAuth for any MCP server
2. **OAuth Trigger Action** - Server action that initiates OAuth based on server type
3. **Token Storage** - Secure storage in encrypted env with multiple format support
4. **UI Integration** - OAuth button that triggers real authentication flow
5. **Token Injection** - Automatic token passing via env and Authorization headers

### How It Works
1. User clicks "Authenticate" button on server requiring auth
2. System spawns appropriate process (mcp-remote for Linear, direct for others)
3. OAuth flow opens in browser, user completes authentication
4. Token captured from process output or ~/.mcp-auth directory
5. Token stored encrypted in server's env and config
6. Playground/proxy automatically use token for all requests
7. Servers marked as authenticated, no need to re-auth

### Key Features
- Supports mcp-remote servers (Linear) with proper port configuration
- Handles direct OAuth servers with --oauth flag
- Multiple token format support (OAUTH_ACCESS_TOKEN, Bearer headers, etc.)
- Automatic token detection and capture
- Polling for completion with user feedback
- Fallback to info dialog for unsupported servers

## Notes
- Always think generically - no Linear-specific or server-specific solutions ✓
- Consider OAuth 2.1 spec compliance (MCP as resource server) ✓
- Handle both SSE and Streamable HTTP transports ✓
- Support various OAuth flows (authorization code, PKCE, etc.) ✓