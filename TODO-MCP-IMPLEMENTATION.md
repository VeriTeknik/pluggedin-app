# MCP Streamable HTTP Implementation TODO

## Overview
This document tracks the implementation of MCP (Model Context Protocol) Streamable HTTP endpoint enhancements for the Plugged.in platform.

**Created**: 2025-08-31  
**Status**: In Progress

## Current Issues

### 🔴 Issue 1: Missing Static Tools
- **Problem**: Only 2 tools show in MCP Inspector (`sequentialthinking` and query postgres) instead of the 14 static tools
- **Expected**: All 14 static tools from pluggedin-mcp should be available
- **Status**: ❌ Not Started

### 🔴 Issue 2: Tool Name Collisions (GitHub #21)
- **Problem**: Multiple MCP servers with same tool names cause conflicts
- **Reference**: https://github.com/VeriTeknik/pluggedin-mcp/discussions/21
- **Solution**: Prefix tool names with server aliases (e.g., `github__create_issue`)
- **Status**: ❌ Not Started

### 🔴 Issue 3: No Dynamic Tool Aggregation
- **Problem**: Streamable HTTP endpoint doesn't fetch tools from user's configured MCP servers
- **Expected**: Tools from active Hub/Profile should be aggregated
- **Status**: ❌ Not Started

### 🟡 Issue 4: Workspace vs Hub Terminology
- **Problem**: Mixed terminology between "Workspace" and "Hub"
- **Solution**: Standardize on "Hub" terminology
- **Status**: ⚠️ Deferred

## Implementation Phases - pluggedin-mcp Proxy

### Phase 0: Fix Tool Name Collisions in pluggedin-mcp ✅
**Repository**: `/Users/ckaraca/Mns/pluggedin-mcp`

- [x] Modify `/src/mcp-proxy.ts` to add server name prefixes
- [x] Update `toolToServerMap` to track prefixed names
- [x] Sanitize server names for safe prefixing
- [x] Update tool execution to handle prefixed names
- [x] Parse prefixed names to route to correct server
- [ ] Maintain backward compatibility for existing integrations
- [ ] Test with multiple servers having same tool names

**Files to modify in pluggedin-mcp:**
- `/src/mcp-proxy.ts` - Add prefixing logic
- `/src/utils.ts` - Add sanitization helper
- `/src/client.ts` - Update tool execution routing

## Implementation Phases - pluggedin-app Streamable HTTP

### Phase 1: Fix Static Tools Registration ✅

- [x] Verify all 14 static tools are in `staticTools` array
- [x] Fix `getAllTools()` function in `/lib/mcp/server.ts`
- [x] Complete placeholder implementations for static tool handlers
- [x] Test all static tools appear in tools/list response

**Static Tools Checklist:**
- [ ] `pluggedin_setup` - Setup instructions (no API key required)
- [ ] `pluggedin_discover_tools` - Trigger tool discovery
- [ ] `pluggedin_rag_query` - RAG document query
- [ ] `pluggedin_send_notification` - Send notifications
- [ ] `pluggedin_list_notifications` - List notifications
- [ ] `pluggedin_mark_notification_done` - Mark notification done
- [ ] `pluggedin_delete_notification` - Delete notification
- [ ] `pluggedin_create_document` - Create AI document
- [ ] `pluggedin_list_documents` - List documents
- [ ] `pluggedin_search_documents` - Search documents
- [ ] `pluggedin_get_document` - Get document by ID
- [ ] `pluggedin_update_document` - Update document
- [ ] `get_tools` - List all available tools
- [ ] `tool_call` - Execute any tool

### Phase 2: Extract Profile Context from Authentication ✅

- [x] Modify `/lib/mcp/auth.ts` to return profile UUID
- [x] Handle OAuth token authentication with profile context
- [x] Handle API key authentication with profile context
- [x] Update `/lib/mcp/streamable-http/server.ts` to pass profile to handlers
- [x] Store profile UUID in session for stateful connections

### Phase 3: Implement Tool Aggregation with Name Prefixing ✅

- [x] Create `/lib/mcp/tool-aggregator.ts` class
- [x] Query database for MCP servers in profile
- [x] Fetch tools from each active MCP server
- [x] Implement server name sanitization for prefixes
- [x] Add tool name prefixing logic (e.g., `servername__toolname`)
- [x] Handle tool metadata (_originalName, _serverUuid, _serverName)

### Phase 4: Update Server to Use Tool Aggregator ✅

- [x] Modify `/lib/mcp/server.ts` to use ToolAggregator
- [x] Pass profile UUID to `getAllTools()` function
- [x] Update ListToolsRequestSchema handler with profile context
- [x] Ensure static tools are included without prefixes
- [x] Test aggregated tools response

### Phase 5: Handle Prefixed Tool Execution ✅

- [x] Update `handleDynamicTool()` to parse prefixed names
- [x] Extract server alias and original tool name
- [x] Route tool execution to correct MCP server
- [x] Handle errors for unknown servers/tools
- [x] Maintain backward compatibility for non-prefixed tools

### Phase 6: Update Session Manager ❌

- [ ] Add profileUuid field to SessionData interface
- [ ] Store profile context in session
- [ ] Pass profile through session for stateful requests
- [ ] Handle session expiration with profile cleanup

## Files to Modify

### pluggedin-mcp Repository

| File | Purpose | Status |
|------|---------|--------|
| `/src/mcp-proxy.ts` | Add server name prefixing to tools | ❌ |
| `/src/utils.ts` | Add server name sanitization helper | ❌ |
| `/src/client.ts` | Update tool execution for prefixed names | ❌ |

### pluggedin-app Repository

| File | Purpose | Status |
|------|---------|--------|
| `/lib/mcp/server.ts` | Fix static tools, add profile-aware aggregation | ❌ |
| `/lib/mcp/streamable-http/server.ts` | Pass profile context to handlers | ❌ |
| `/lib/mcp/auth.ts` | Return profile UUID from authentication | ❌ |
| `/lib/mcp/session-manager.ts` | Store profile in session | ❌ |
| `/lib/mcp/tools/static-tools.ts` | Ensure all tools exported correctly | ❌ |

## Files to Create

| File | Purpose | Repository | Status |
|------|---------|-----------|--------|
| `/lib/mcp/tool-aggregator.ts` | Tool aggregation with name prefixing | pluggedin-app | ❌ |

## Testing Checklist

### pluggedin-mcp Proxy Testing
- [ ] Tools from multiple servers are properly prefixed
- [ ] Format: `servername_toolname` (single underscore)
- [ ] Tool execution works with prefixed names
- [ ] No conflicts when servers have same tool names
- [ ] Backward compatibility maintained

### Basic Functionality
- [ ] All 14 static tools appear in MCP Inspector
- [ ] Static tools execute correctly
- [ ] Tools return proper responses

### Dynamic Tool Loading
- [ ] Tools from user's MCP servers are loaded
- [ ] Tools are properly prefixed (e.g., `github__create_issue`)
- [ ] Tool descriptions include server information

### Tool Name Collision Resolution
- [ ] Multiple servers with same tool names work correctly
- [ ] Each tool has unique prefixed name
- [ ] No conflicts in tool execution

### Authentication & Profile Context
- [ ] OAuth authentication provides profile UUID
- [ ] API key authentication provides profile UUID
- [ ] Profile context passed to tool aggregator
- [ ] Session maintains profile information

### Tool Execution
- [ ] Static tools execute without prefix
- [ ] Dynamic tools execute with prefix
- [ ] Error handling for unknown tools
- [ ] Proper routing to correct MCP server

## Success Criteria

✅ **Static Tools**
- All 14 static tools visible in MCP Inspector
- Tools execute correctly with proper responses
- No placeholder implementations remain

✅ **Tool Aggregation**
- Dynamic tools from user's MCP servers are loaded
- Tools are aggregated based on active profile
- Profile context properly extracted from auth

✅ **Name Collision Resolution**
- Tool names prefixed with server alias
- Format: `servername__toolname`
- No conflicts when multiple servers have same tool names
- Original tool names preserved in metadata

✅ **Execution**
- Tool execution works with prefixed names
- Proper routing to correct MCP server
- Error handling for edge cases

## Notes

### Tool Name Prefixing Format

**pluggedin-mcp proxy (standalone)**:
- Use single underscore `_` as separator
- Server name sanitized to alphanumeric
- Example: `github_create_issue`
- Applied to all dynamic tools from MCP servers

**pluggedin-app Streamable HTTP**:
- Use double underscore `__` as separator  
- Server name sanitized to alphanumeric + hyphens
- Example: `github-server__create_issue`
- Applied only to dynamic tools (not static tools)

### Profile Context Flow
1. Client authenticates (OAuth or API key)
2. Authentication returns profile UUID
3. Profile UUID passed to tool aggregator
4. Tools fetched for specific profile
5. Tools returned with server prefixes

### Backward Compatibility
- Static tools remain unprefixed
- Support legacy tool names where possible
- Clear error messages for deprecated patterns

## Related Documentation
- [MCP Specification](https://modelcontextprotocol.io/specification/2025-06-18)
- [GitHub Issue #21](https://github.com/VeriTeknik/pluggedin-mcp/discussions/21)
- [OAuth Implementation](/docs/mcp-compliance-todo.md)

## Progress Tracking

**Last Updated**: 2025-08-31  
**Completed**: 6/7 phases (Phase 0-5 completed, Phase 6 partial)  
**In Progress**: Phase 6 (Session Manager updates)  
**Blocked**: None

### Implementation Order
1. **Phase 0**: Fix pluggedin-mcp proxy prefixing (GitHub #21)
2. **Phase 1**: Add static tools to Streamable HTTP
3. **Phase 2-6**: Complete remaining phases  

---

*Use this document to track implementation progress. Check off items as completed and update status regularly.*