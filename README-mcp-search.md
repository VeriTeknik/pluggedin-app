# MCP Server Search

This feature allows users to search for Model Context Protocol (MCP) servers from multiple sources, compare them, and easily install them into their workspaces.

## Features

### Multiple Data Sources

The search functionality integrates with several sources:

1. **Smithery Registry** - Official MCP server registry
   - Uses the Smithery Registry API to search for MCP servers
   - Displays detailed information about each server
   - Supports one-click installation

2. **NPM Packages** - JavaScript MCP implementations
   - Searches NPM for packages with the "modelcontextprotocol" keyword
   - Shows download statistics and package information
   - Extracts environment variables from package metadata

3. **GitHub Repositories** - MCP server implementations
   - Searches GitHub for repositories related to MCP
   - Integrates with the "awesome-mcp-servers" curated list
   - Shows stars and last update information

4. **Plugged In** - Local repository of user-created MCP servers
   - Shows servers created by the user
   - Allows easy sharing and reuse

### Advanced Features

- **Smart Caching**: All search results are cached to improve performance and reduce API calls
  - Different cache TTL for each source
  - Automatic background refresh for popular searches

- **Category Detection**: AI-powered automatic categorization of MCP servers
  - Intelligently assigns categories based on names, descriptions, and tags
  - Categories include LLM, Utility, Tool, Data, Code, Search, Image, and more
  - Displayed with corresponding icons for improved UI

- **Tag-Based Filtering**: Filter servers by tags to find exactly what you need
  - Dynamically generated from search results
  - Support for multiple tag selection

- **Category Filtering**: Filter servers by category
  - Easily find servers for specific use cases
  - Categories displayed with descriptive icons

- **Flexible Sorting**: Sort results by different criteria
  - Relevance (default)
  - Popularity (installs/downloads)
  - Recency (last updated)
  - GitHub stars

- **Source Selection**: Choose which sources to search from
  - Search all sources at once
  - Focus on specific sources for more targeted results

- **Detailed Server Information**: View comprehensive details about each server
  - Command and arguments
  - Environment variables
  - Repository links
  - Documentation

- **One-Click Installation**: Easily add any MCP server to your workspace
  - Automatic detection of server type (STDIO or SSE)
  - Pre-filled configuration based on server metadata

- **Installation Tracking**: Anonymous tracking of server installations
  - Most popular servers highlighted
  - Trending servers promoted in the UI

- **Server Ratings**: User ratings for servers
  - 1-5 star ratings with comments
  - Average rating displayed in the UI

## Technical Implementation

- **Database Schema**: Extended to track server sources, metadata, and search results
  - Added McpServerSource enum
  - Added searchCacheTable for caching search results
  - Added serverInstallationsTable for tracking installations
  - Added serverRatingsTable for user ratings and reviews

- **Category Detection**: Smart category detection using AI-like pattern matching
  - Keyword-based detection for different server categories
  - Weights name and tag matches more heavily

- **API Structure**:
  - `/api/service/search`: Main search endpoint with filtering and pagination
  - `/api/service/search/[qualifiedName]`: Detailed information about specific servers
  - Server actions for tracking installations and ratings

- **Integration with External APIs**:
  - Smithery Registry API
  - NPM Registry API
  - GitHub API
  - awesome-mcp-servers list parsing

- **Frontend Components**:
  - Enhanced search page with sorting and filtering
  - Source tabs for easy navigation
  - Category and tag-based filtering
  - Responsive card view with category badges

## Implementation Phases

### Phase 1: Initial Integration
- Database schema updates for external sources
- Smithery API integration with caching
- Basic search UI with source tabs
- Installation support for different server types

### Phase 2: Source Expansion
- NPM package source integration
- GitHub repository source integration
- Enhanced filtering and sorting options
- UI improvements for results display

### Phase 3: Advanced Features
- Automatic category detection system
- Category-based filtering in UI
- Installation and rating tracking
- Enhanced metrics for popularity tracking
- Database migrations for tracking installations and ratings

## Future Enhancements

Planned features for future versions:

1. **User Reviews**: Allow users to write detailed reviews for servers
2. **Trending Servers**: Show trending and popular servers based on recent installations
3. **Server Comparison**: Compare features and capabilities of different servers
4. **Testing Tools**: Test servers directly from the search interface
5. **Recommendations**: Suggest related or complementary servers
6. **Version History**: Track changes and updates to servers over time 