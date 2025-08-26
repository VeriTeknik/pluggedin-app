#!/bin/bash

# Test OAuth flow for Plugged.in native authentication

echo "=== Testing Plugged.in OAuth Flow ==="
echo ""

# Step 1: Register a client using DCR
echo "1. Registering OAuth client..."
CLIENT_RESPONSE=$(curl -s -X POST http://localhost:12005/api/oauth/client/register \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Test MCP Connector",
    "redirect_uris": ["http://localhost:12005/api/mcp/oauth/callback"],
    "grant_types": ["authorization_code"],
    "response_types": ["code"],
    "scope": "mcp:read mcp:execute"
  }')

CLIENT_ID=$(echo $CLIENT_RESPONSE | jq -r '.client_id')
CLIENT_SECRET=$(echo $CLIENT_RESPONSE | jq -r '.client_secret')

echo "Client registered!"
echo "Client ID: $CLIENT_ID"
echo "Client Secret: $CLIENT_SECRET"
echo ""

# Step 2: Generate authorization URL
echo "2. Authorization URL:"
AUTH_URL="http://localhost:12005/api/mcp/oauth/authorize?provider=pluggedin&client_id=$CLIENT_ID&scope=mcp:read+mcp:execute"
echo $AUTH_URL
echo ""
echo "Open this URL in your browser to authorize the application."
echo "After authorization, you'll be redirected with a code parameter."
echo ""

# Step 3: Instructions for token exchange
echo "3. After authorization, exchange the code for tokens:"
echo "curl -X POST http://localhost:12005/api/oauth/token \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -d '{"
echo "    \"grant_type\": \"authorization_code\","
echo "    \"code\": \"YOUR_AUTH_CODE\","
echo "    \"redirect_uri\": \"http://localhost:12005/api/mcp/oauth/callback\","
echo "    \"client_id\": \"$CLIENT_ID\","
echo "    \"client_secret\": \"$CLIENT_SECRET\""
echo "  }'"
echo ""

# Step 4: Test with access token
echo "4. Use the access token to call MCP endpoints:"
echo "curl -X POST http://localhost:12005/mcp \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -H \"Authorization: Bearer YOUR_ACCESS_TOKEN\" \\"
echo "  -d '{\"jsonrpc\":\"2.0\",\"method\":\"tools/list\",\"params\":{},\"id\":1}'"