# MCP Registry Server Installation Fixes

## Issue Summary
After migrating the registry-proxy to PostgreSQL, users experienced critical issues where most MCP servers from the registry failed to install properly on the /mcp-servers tab, showing "Connection closed" errors during tool discovery.

## Root Causes Identified

### 1. **Arguments Array Corruption**
- **Problem**: Command arguments were being incorrectly converted from arrays to strings and back
- **Example**: `["npx", "-y", "snyk"]` → `"npx -y snyk"` → `["npx", "snyk", "only"]` (corrupted)
- **Impact**: Servers like Snyk MCP (UUID: fe9ec616-ab3f-43af-9af2-ebc1c40b96a5) failed to start

### 2. **Remote Servers Not Recognized**
- **Problem**: Remote servers (SSE/HTTP) were being treated as STDIO servers
- **Example**: ai.waystation/slack was incorrectly processed as a package-based server
- **Impact**: 57% of registry servers (remote servers) failed to connect

### 3. **Missing TypeScript Interfaces**
- **Problem**: `remotes` field was missing from TypeScript interfaces
- **Impact**: Remote server URLs and transport types were ignored

## Registry Analysis Results
Analysis of 30+ servers from https://registry.plugged.in/v0/servers revealed:
- **43% Package-based servers** (npm, pypi, docker): Use STDIO transport
- **57% Remote servers** (SSE, streamable-http): Connect via URLs
- Some servers offer multiple installation options

## Files Modified

### 1. `/home/pluggedin/registry/pluggedin-app/lib/registry/pluggedin-registry-client.ts`
```typescript
// Added remotes field to interface
remotes?: Array<{
  transport_type: 'sse' | 'streamable-http' | 'http';
  url: string;
  headers?: Record<string, string>;
}>;
```

### 2. `/home/pluggedin/registry/pluggedin-app/lib/registry/registry-transformer.ts`
```typescript
// New comprehensive transport inference function
export function inferTransportType(
  server: {
    packages?: RegistryPackage[];
    remotes?: Array<{ transport_type: string; url: string; headers?: Record<string, string> }>
  }
): {
  transport: 'stdio' | 'sse' | 'streamable-http' | 'http';
  url?: string;
  headers?: Record<string, string>;
} {
  // Priority 1: Check remotes first (remote servers don't need installation)
  if (server.remotes?.length) {
    const remote = server.remotes.find(r => r.transport_type === 'streamable-http')
                   || server.remotes.find(r => r.transport_type === 'sse')
                   || server.remotes[0];
    return {
      transport: remote.transport_type as 'sse' | 'streamable-http' | 'http',
      url: remote.url,
      headers: remote.headers
    };
  }
  // Priority 2: Check packages for stdio servers
  // ... package-based logic
}
```

### 3. `/home/pluggedin/registry/pluggedin-app/app/(sidebar-layout)/(container)/search/components/CardGrid.tsx`
```typescript
// Fixed: Keep args as array throughout pipeline
// Before (line 161):
args: isSSE ? '' : (Array.isArray(detailedItem.args) ? detailedItem.args.join(' ') : '') || '',

// After:
args: isSSE ? [] : (Array.isArray(detailedItem.args) ? detailedItem.args : []) || [],
```

### 4. `/home/pluggedin/registry/pluggedin-app/app/(sidebar-layout)/(container)/search/components/InstallDialog.tsx`
```typescript
// Updated to handle array or string args
interface InstallDialogProps {
  serverData: {
    args: string | string[];  // Changed from just string
    // ...
  };
}

// Convert array to string for form display
args: Array.isArray(serverData.args) ? serverData.args.join(' ') : serverData.args,
```

### 5. `/home/pluggedin/registry/pluggedin-app/app/actions/registry-servers.ts`
```typescript
// Updated to use new transport inference
const transportInfo = inferTransportType(server);
const serverType = transportInfo.transport === 'stdio' ? 'STDIO' :
                  transportInfo.transport === 'sse' ? 'SSE' :
                  transportInfo.transport === 'streamable-http' ? 'STREAMABLE_HTTP' : 'HTTP';

// Handle remote servers differently
command: transportInfo.url ? '' : command,  // No command for remote servers
args: transportInfo.url ? [] : args,  // No args for remote servers
url: transportInfo.url,  // Add URL for remote servers
```

### 6. `/home/pluggedin/registry/pluggedin-app/app/api/registry/server/[...id]/route.ts`
- Fixed to handle server IDs with slashes using catch-all route `[...id]`
- Joins path segments: `const serverId = id.join('/')`

### 7. API Proxy Routes Created
- `/api/registry/feedback/route.ts` - Proxy for fetching reviews
- `/api/registry/stats/route.ts` - Proxy for server stats
- `/api/registry/rating/route.ts` - Proxy for user rating checks

### 8. `/home/pluggedin/registry/proxy/internal/handlers/ratings.go`
- Added `HandleGetUserRating` endpoint for checking existing ratings
- Fixed routing to handle server IDs with slashes

## Testing Checklist

### Package-based Servers (STDIO)
- [ ] **Snyk MCP** (io.snyk/mcp) - Should show: `npx -y snyk`
- [ ] **Playwright MCP** (io.syntellix/mcp-playwright) - Should show: `npx -y @syntellix/mcp-playwright`
- [ ] **Web Browser** (io.github.blubberdiblub/web-browser) - Should show: `uvx mcp-web-browser`
- [ ] **OpenAI** (io.github.pierrebrunelle/openai-mcp) - Should show: `npx -y openai-mcp`

### Remote Servers (SSE/HTTP)
- [ ] **Waystation Slack** (ai.waystation/slack) - Should show URL field with `https://api.waystation.ai/mcp/sse?token={token}`
- [ ] **ChainLoop** (com.chainloop/attestation) - Should show URL field
- [ ] **Sequential Thinking** (com.sequentialthinking/v1) - Should show URL field

### Docker-based Servers
- [ ] **Browserbase** (com.browserbase/mcp) - Should show: `docker run ghcr.io/browserbasehq/mcp-browserbase:latest`

### Complex Arguments
- [ ] Verify no "only" corruption in arguments
- [ ] Check environment variables are preserved
- [ ] Confirm arrays remain as arrays

## Deployment Steps

1. **Build the updated app**:
   ```bash
   cd /home/pluggedin/registry/pluggedin-app
   npm run build
   ```

2. **Deploy to production** (if tests pass):
   ```bash
   # Deploy command depends on your deployment setup
   ```

3. **Monitor for errors**:
   - Check browser console for "Connection closed" errors
   - Monitor server logs for MCP discovery failures
   - Verify tool discovery completes successfully

## Success Metrics
- All registry servers should install without "Connection closed" errors
- Remote servers should connect via their URLs
- Package-based servers should execute with correct arguments
- No argument corruption (no spurious "only" in commands)
- Ratings and reviews should display properly

## Rollback Plan
If issues persist:
1. Revert CardGrid.tsx changes
2. Revert registry-transformer.ts changes
3. Restore original interfaces
4. Redeploy previous version

## Notes
- The fix maintains backward compatibility
- Remote servers now properly identified and handled
- Arguments preserved as arrays throughout the pipeline
- Transport type inference prioritizes remotes over packages