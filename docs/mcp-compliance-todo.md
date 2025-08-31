# MCP Specification Compliance TODO

## Overview
This document tracks compliance with the Model Context Protocol (MCP) Specification version 2025-06-18.
Reference: https://modelcontextprotocol.io/specification/2025-06-18

## Recent Accomplishments (2025-08-31)

### OAuth Implementation ✅
- Successfully implemented OAuth 2.0 + PKCE flow
- MCP Inspector can now authenticate and connect
- Resource indicators (RFC 8707) support added
- Dynamic client registration working
- OAuth discovery endpoints functional

### MCP Protocol Implementation ✅
- `initialize` method with protocol version negotiation
- `notifications/initialized` handler for client confirmation
- `logging/setLevel` support for debugging
- `tools/list` and `tools/call` methods working
- `resources/list` method returning empty array
- `prompts/list` method returning empty array
- `ping` method for connection health checks
- Session management with secure IDs in headers
- SSE stream for server-to-client communication

### Key Fixes Applied
- Fixed OAuth authorization page popup/iframe detection
- Added missing `Mcp-Session-Id` headers to all responses
- Updated protocol version from 1.0.0 to 2025-06-18
- Updated @modelcontextprotocol/sdk to latest version (1.17.4)
- Fixed server-side rendering issues in OAuth page

## Current Status
- **OAuth Implementation**: ✅ Full OAuth 2.0 + PKCE flow working with MCP Inspector
- **MCP Transport**: ✅ HTTP/SSE transport working
- **Protocol Compliance**: ⚠️ Basic compliance achieved, advanced features pending
- **MCP Inspector**: ✅ Successfully tested and working (2025-08-31)

---

## Phase 1: OAuth & Authorization Compliance (CRITICAL)

### 1.1 Resource Indicators (RFC 8707) Support
**Priority: URGENT** - Required by MCP specification

- [x] Accept `resource` parameter in authorization requests ✅ (2025-08-31)
- [x] Store `resource` field in `oauth_authorization_codes` table ✅ (2025-08-31)
- [x] Validate resource parameter format (must be absolute URI) ✅ (2025-08-31)
- [ ] Include resource in access token metadata
- [ ] Validate token audience matches requested resource

**Files to modify:**
- `app/api/oauth/authorize/route.ts`
- `db/schema.ts` (add resource field)
- `lib/oauth/provider.ts`
- Migration: `drizzle/00XX_add_resource_to_oauth.sql`

### 1.2 Token Security Hardening
**Priority: HIGH** - Security vulnerability

- [ ] Reject tokens in query parameters (create middleware)
- [ ] Implement exact redirect URI matching (no partial matches)
- [ ] Add token audience validation
- [ ] Prevent token passthrough (explicitly forbidden by spec)
- [ ] Validate token claims and constraints

**Files to modify:**
- `middleware.ts` (add query token rejection)
- `lib/oauth/provider.ts` (exact URI matching)
- `lib/mcp/auth.ts` (audience validation)

### 1.3 Error Response Standardization
**Priority: HIGH** - Spec compliance

- [ ] Return 401 for missing/invalid authentication
- [ ] Return 403 for insufficient permissions/scopes
- [ ] Return 400 for malformed requests
- [ ] Include proper OAuth error responses (`invalid_request`, `invalid_client`, etc.)

**Files to modify:**
- `lib/mcp/auth.ts`
- `lib/mcp/streamable-http/server.ts`
- `lib/mcp/error-handler.ts`

---

## Phase 2: MCP Protocol Compliance (CRITICAL)

### 2.1 Lifecycle Management
**Priority: URGENT** - Required by spec

- [x] Implement proper `initialize` request handler ✅ (2025-08-31)
- [x] Send server capabilities in response ✅ (2025-08-31)
- [x] Wait for `initialized` notification before accepting requests ✅ (2025-08-31)
- [x] Implement protocol version negotiation ✅ (2025-08-31)
- [ ] Add timeout handling for initialization

**Files to create/modify:**
- `lib/mcp/lifecycle.ts` (new)
- `lib/mcp/streamable-http/server.ts`

### 2.2 Session Management
**Priority: HIGH** - Required for stateful operations

- [x] Generate cryptographically secure session IDs ✅ (2025-08-31)
- [x] Use only visible ASCII characters in session IDs ✅ (2025-08-31)
- [x] Include `Mcp-Session-Id` in response headers ✅ (2025-08-31)
- [ ] Bind sessions to user information (prevent hijacking)
- [x] Implement session expiration and rotation ✅ (2025-08-31)
- [x] Never use sessions for authentication (spec requirement) ✅ (2025-08-31)

**Files to modify:**
- `lib/mcp/session-manager.ts`
- `lib/mcp/streamable-http/server.ts`

### 2.3 Transport Headers & CORS
**Priority: HIGH** - Required for HTTP transport

- [ ] Require `MCP-Protocol-Version` header from clients
- [ ] Include proper `Accept` headers validation
- [ ] Validate `Origin` header (prevent DNS rebinding)
- [ ] Support both `application/json` and `text/event-stream`
- [ ] Don't broadcast SSE messages across streams

**Files to modify:**
- `app/mcp/route.ts`
- `lib/mcp/streamable-http/server.ts`

---

## Phase 3: Core MCP Features

### 3.1 Tools Implementation
**Priority: MEDIUM** - Core functionality

- [x] Implement `tools/list` with proper pagination ✅ (2025-08-31)
- [x] Return proper tool schemas (inputSchema required) ✅ (2025-08-31)
- [x] Implement `tools/call` with validation ✅ (2025-08-31)
- [ ] Add `isError` flag for error responses
- [ ] Support structured content responses
- [ ] Validate tool inputs against schema

**Files to modify:**
- `lib/mcp/tools/handler.ts`
- `lib/mcp/tools/validator.ts`

### 3.2 Resources Implementation
**Priority: MEDIUM** - Core functionality

- [x] Implement `resources/list` with pagination ✅ (2025-08-31 - Returns empty array)
- [ ] Implement `resources/read` with content types
- [ ] Support resource templates
- [ ] Add subscription capability (optional)
- [ ] Validate resource URIs
- [ ] Support binary content encoding

**Files to create:**
- `lib/mcp/resources/handler.ts`
- `lib/mcp/resources/validator.ts`

### 3.3 Prompts Implementation
**Priority: LOW** - Optional feature

- [x] Implement `prompts/list` with pagination ✅ (2025-08-31 - Returns empty array)
- [ ] Implement `prompts/get` for retrieval
- [ ] Support prompt arguments
- [ ] Add prompt validation
- [ ] Support multiple content types

**Files to create:**
- `lib/mcp/prompts/handler.ts`

---

## Phase 4: Security & Best Practices

### 4.1 Confused Deputy Problem
**Priority: HIGH** - Security requirement

- [ ] Obtain user consent for each dynamically registered client
- [ ] Prevent consent screen bypass
- [ ] Validate all proxy requests
- [ ] Maintain audit trails

**Files to modify:**
- `app/api/oauth/authorize/route.ts`
- `lib/oauth/provider.ts`

### 4.2 Token Management
**Priority: HIGH** - Security requirement

- [ ] Implement token introspection endpoint
- [ ] Implement token revocation endpoint
- [ ] Add refresh token rotation
- [ ] Short-lived access tokens (currently 1 hour - OK)
- [ ] Secure token storage (hashing - already done ✅)

**Files to create:**
- `app/api/oauth/introspect/route.ts`
- `app/api/oauth/revoke/route.ts`

### 4.3 Rate Limiting & Monitoring
**Priority: MEDIUM** - Best practice

- [ ] Implement per-client rate limiting
- [ ] Add request pattern monitoring
- [ ] Create audit logs for security events
- [ ] Monitor for suspicious activity
- [ ] Implement circuit breakers

**Files to modify:**
- `lib/rate-limiter.ts`
- `lib/mcp/health-monitor.ts`

---

## Phase 5: Additional Compliance

### 5.1 Content Type Support
**Priority: LOW** - Extended functionality

- [ ] Support all MCP content types (text, image, audio)
- [ ] Implement proper content encoding
- [ ] Add content validation
- [ ] Support embedded resources

### 5.2 Error Handling
**Priority: MEDIUM** - User experience

- [ ] Implement standard JSON-RPC error codes
- [ ] Add detailed error descriptions
- [ ] Support error data fields
- [ ] Implement proper error recovery

### 5.3 Capability Negotiation
**Priority: MEDIUM** - Protocol compliance

- [ ] Declare all server capabilities
- [ ] Negotiate protocol features
- [ ] Support experimental features flag
- [ ] Version compatibility checking

---

## Implementation Order

### Week 1 (URGENT - Security & Compliance)
1. Phase 1.1 - Resource Indicators
2. Phase 1.2 - Token Security
3. Phase 2.1 - Lifecycle Management
4. Phase 2.2 - Session Management

### Week 2 (HIGH - Core Protocol)
1. Phase 1.3 - Error Responses
2. Phase 2.3 - Transport Headers
3. Phase 3.1 - Tools Implementation
4. Phase 4.1 - Confused Deputy

### Week 3 (MEDIUM - Features)
1. Phase 3.2 - Resources
2. Phase 4.2 - Token Management
3. Phase 4.3 - Rate Limiting
4. Phase 5.2 - Error Handling

### Week 4 (LOW - Nice to Have)
1. Phase 3.3 - Prompts
2. Phase 5.1 - Content Types
3. Phase 5.3 - Capability Negotiation

---

## Testing Requirements

### OAuth Testing
- [x] Test with MCP Inspector ✅ (2025-08-31 - Working!)
- [x] Test resource parameter validation ✅ (2025-08-31)
- [ ] Test token expiry and refresh
- [x] Test PKCE flow ✅ (2025-08-31)
- [ ] Test error responses

### Protocol Testing
- [x] Test initialization sequence ✅ (2025-08-31)
- [x] Test session management ✅ (2025-08-31)
- [x] Test tools listing and calling ✅ (2025-08-31)
- [ ] Test resource operations
- [ ] Test error handling

### Security Testing
- [ ] Test token validation
- [ ] Test redirect URI validation
- [ ] Test rate limiting
- [ ] Test audit logging
- [ ] Penetration testing

---

## Database Migrations Required

```sql
-- 1. Add resource field to oauth codes
ALTER TABLE oauth_authorization_codes 
ADD COLUMN resource TEXT;

-- 2. Add resource field to oauth tokens
ALTER TABLE oauth_tokens 
ADD COLUMN resource TEXT;

-- 3. Add audit log table
CREATE TABLE oauth_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  client_id TEXT,
  user_id UUID,
  resource TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Add session metadata
ALTER TABLE mcp_sessions
ADD COLUMN user_info JSONB,
ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN last_activity TIMESTAMP WITH TIME ZONE;
```

---

## Notes & Considerations

1. **Backward Compatibility**: Maintain support for existing API key authentication
2. **Performance**: Consider caching for frequently accessed resources
3. **Scalability**: Design with horizontal scaling in mind
4. **Documentation**: Update API docs for each implemented phase
5. **Monitoring**: Add metrics for each new endpoint

## References
- [MCP Specification](https://modelcontextprotocol.io/specification/2025-06-18)
- [OAuth 2.1 Draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-10)
- [RFC 8707 - Resource Indicators](https://datatracker.ietf.org/doc/html/rfc8707)
- [RFC 8414 - OAuth Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)
- [RFC 7636 - PKCE](https://datatracker.ietf.org/doc/html/rfc7636)