# langchain-mcp-tools v0.3.1 Update

## Summary
Updated the MCP playground to use @h1deya/langchain-mcp-tools version 0.3.1, which includes breaking changes around schema transformation and requires specifying the LLM provider.

## Changes Made

### 1. Package Update
- Updated `@h1deya/langchain-mcp-tools` from `^0.2.9` to `^0.3.1` in `package.json`
- Ran `pnpm install` to update dependencies

### 2. API Changes

#### Progressive MCP Initialization (`app/actions/progressive-mcp-initialization.ts`)
- Added `llmProvider` parameter to the options interface:
  ```typescript
  llmProvider?: 'anthropic' | 'openai' | 'google_genai' | 'google_gemini' | 'none';
  ```
- Updated `initializeSingleServer` function to accept and pass through the `llmProvider`
- Modified `convertMcpToLangchainTools` call to include the `llmProvider` option

#### MCP Playground Action (`app/actions/mcp-playground.ts`)
- Added provider mapping logic to convert playground providers to langchain-mcp-tools format:
  - `'anthropic'` → `'anthropic'`
  - `'openai'` → `'openai'`
  - `'google'` → `'google_genai'`
- Pass the mapped provider to `progressivelyInitializeMcpServers`

## Key Breaking Changes in v0.3.0
1. **Removed automatic JSON schema transformation** - The library no longer automatically transforms schemas
2. **Required llmProvider option** - Must specify target LLM provider for schema transformations
3. **New provider types** - Uses `'google_genai'` and `'google_gemini'` instead of just `'google'`

## Migration Guide
When calling `convertMcpToLangchainTools`, you must now include the `llmProvider` option:

```typescript
// Before (v0.2.9)
const result = await convertMcpToLangchainTools(configForTool, { logger });

// After (v0.3.1)
const result = await convertMcpToLangchainTools(configForTool, { 
  logger,
  llmProvider: 'anthropic' // or 'openai', 'google_genai', 'google_gemini', 'none'
});
```

## Testing
The changes ensure that:
1. The correct LLM provider is passed from the playground configuration
2. Provider names are properly mapped to match langchain-mcp-tools expectations
3. Schema transformations are applied based on the specified provider
4. All existing functionality continues to work as expected