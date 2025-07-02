# Registry Publishing Flow Test Scenarios

## Test Scenario: VeriTeknik/pluggedin-mcp Repository

### Repository Information
- **GitHub URL**: https://github.com/VeriTeknik/pluggedin-mcp
- **Description**: Plugged.in MCP Server manages all your other MCPs in one MCP
- **Type**: Public repository
- **Owner**: VeriTeknik (organization)
- **Main branch**: main
- **Package**: @pluggedin/pluggedin-mcp-proxy (npm)

### Test Flow 1: Registry Publishing (Owner)

1. **Input GitHub URL**
   - Enter: `https://github.com/VeriTeknik/pluggedin-mcp`
   - Expected: Auto-detection starts

2. **Ownership Verification**
   - If not authenticated: Shows "Authenticate for Registry" button
   - If authenticated: Checks if user owns VeriTeknik org
   - Expected: Shows ownership status badge

3. **Registry Check**
   - System checks if `io.github.VeriTeknik/pluggedin-mcp` exists in registry
   - Expected: If not found, prepares for publishing

4. **Configuration Detection**
   - Analyzes repository for MCP configuration
   - Detects package.json with npm package info
   - Expected: Shows detected configuration with:
     - Command: `npx`
     - Args: `@pluggedin/pluggedin-mcp-proxy`
     - Environment variables (if any)

5. **Publishing Action**
   - If owner: Button shows "Publish to Registry"
   - Click to publish
   - Expected: 
     - Shows "Publishing to MCP Registry..." toast
     - On success: "Successfully published to MCP Registry!"
     - Creates local entry with registry reference
     - Closes dialog

### Test Flow 2: Registry Entry (Already Published)

1. **Input Registry ID**
   - Enter: `io.github.VeriTeknik/pluggedin-mcp`
   - Expected: Fetches from registry directly

2. **Configuration Display**
   - Shows registry-sourced configuration
   - Expected: Blue "Registry" badge visible

3. **Add to Profile**
   - Click "Add 1 Server"
   - Expected: Adds to profile with registry source

### Test Flow 3: Duplicate Prevention

1. **Add Server First Time**
   - Add via GitHub URL or Registry ID
   - Expected: Success

2. **Try to Add Again**
   - Enter same URL/ID
   - Expected: 
     - Shows "Duplicate" badge
     - Checkbox disabled
     - Warning toast if clicked

### Expected Registry Payload

```json
{
  "name": "io.github.VeriTeknik/pluggedin-mcp",
  "description": "Plugged.in MCP Server manages all your other MCPs in one MCP",
  "version_detail": {
    "version": "1.0.0"
  },
  "packages": [{
    "registry_name": "npm",
    "name": "@pluggedin/pluggedin-mcp-proxy",
    "version": "1.0.0",
    "environment_variables": [
      {
        "name": "PLUGGEDIN_API_KEY",
        "description": "Environment variable PLUGGEDIN_API_KEY"
      },
      {
        "name": "PLUGGEDIN_API_BASE_URL",
        "description": "Environment variable PLUGGEDIN_API_BASE_URL"
      }
    ]
  }],
  "repository": {
    "url": "https://github.com/VeriTeknik/pluggedin-mcp",
    "source": "github",
    "id": "VeriTeknik/pluggedin-mcp"
  }
}
```

### Error Cases to Test

1. **401 Unauthorized**
   - Expected: "Authentication failed. Please re-authenticate with GitHub."

2. **409 Conflict** 
   - Expected: "This server is already published to the registry"

3. **Network Error**
   - Expected: "Registry publishing failed: [error details]"

### Success Indicators

- ✅ Registry-first approach working (checks registry before analyzing)
- ✅ Ownership verification functioning
- ✅ Duplicate prevention active
- ✅ Success notifications appear
- ✅ Local entry created with registry reference
- ✅ Dialog closes after successful publish