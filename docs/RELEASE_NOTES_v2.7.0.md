# Release Notes: v2.7.0 - Registry v2: Complete MCP Server Discovery & Management Platform

## 🎉 Overview

We're thrilled to announce the release of plugged.in v2.7.0, our most significant update yet! This release introduces Registry v2, a comprehensive overhaul of the MCP server discovery and management system, featuring a modified fork of the official MCP Registry, OAuth integration, trending servers, and bidirectional notifications.

## 🚀 Major Features

### 1. MCP Registry Integration
- **Modified Fork Implementation**: Integrated a customized version of the official [MCP Registry](https://github.com/modelcontextprotocol/registry)
- **GitHub Authentication**: Users can now claim MCP servers using their GitHub credentials
- **Server Publishing**: Submit your MCP servers to the global registry for community discovery
- **Ownership Verification**: Automatic verification of GitHub repository ownership
- **Statistics Migration**: Installation counts and ratings seamlessly transfer when claiming servers

### 2. Completely Rewritten Discovery Process
- **Enhanced Performance**: Optimized server detection with parallel processing
- **Improved Reliability**: Robust error handling and retry mechanisms
- **Smart Caching**: Intelligent caching to reduce redundant discovery attempts
- **Real-time Feedback**: Live progress updates during discovery operations
- **Multi-transport Support**: Seamless handling of STDIO, SSE, and Streamable HTTP

### 3. Full Streamable HTTP Implementation
- **Complete Protocol Support**: Full implementation of the Streamable HTTP transport protocol
- **OAuth 2.1 Integration**: Support for OAuth-based authentication flows
- **Session Management**: Persistent session handling with PostgreSQL storage
- **Custom Headers**: Support for custom headers and authentication tokens
- **Automatic Retries**: Intelligent retry logic for failed connections

### 4. OAuth for MCP Servers
- **Centralized Authentication**: OAuth handled entirely by plugged.in - no client-side auth needed
- **State-of-the-art Encryption**: All OAuth tokens encrypted with AES-256-GCM
- **Multiple Providers**: Support for GitHub, Linear, and custom OAuth providers
- **Secure Popup Flow**: XSS-protected popup-based authentication
- **Automatic Token Management**: Token refresh and cleanup handled automatically

### 5. Trending Servers with Analytics
- **Real-time Activity Tracking**: Every MCP tool call via pluggedin-mcp is tracked
- **Trending Algorithm**: Smart calculation based on recent activity and popularity
- **Installation Metrics**: Track server installations and usage patterns
- **Community Insights**: Discover what servers are popular in the community
- **Performance Optimized**: Efficient queries with composite indexes

### 6. Bidirectional Notifications
- **Send Notifications**: MCP proxy can send custom notifications
- **Receive Notifications**: Retrieve notifications via API
- **Mark as Read**: Update notification status
- **Delete Notifications**: Remove unwanted notifications
- **Real-time Updates**: Instant notification delivery

### 7. Smart Server Wizard
- **Multi-step Interface**: Intuitive wizard for server creation and claiming
- **GitHub Integration**: Automatic repository analysis and ownership verification
- **Environment Detection**: Automatically detects required environment variables
- **Package Detection**: Identifies npm, Docker, PyPI, and GitHub packages
- **Discovery Testing**: Test server capabilities before saving
- **Registry Submission**: Direct submission to the global registry

### 8. Enhanced Security
- **Comprehensive Validation**: Zod schemas for all server actions
- **XSS Prevention**: Eliminated all dangerouslySetInnerHTML usage
- **SSRF Protection**: URL validation prevents access to private networks
- **Input Sanitization**: All user inputs thoroughly sanitized
- **OAuth Security**: State validation and secure token storage

## 📊 Technical Improvements

### Performance Optimizations
- **N+1 Query Prevention**: Parallel data fetching for related data
- **Composite Indexes**: Added for frequent query patterns
- **Optimized Search**: Enhanced filtering and sorting algorithms
- **Reduced Bundle Size**: Removed unused code and dependencies
- **Efficient Caching**: Smart caching strategies for better performance

### Code Quality
- **Console.log Removal**: All console statements removed from production
- **Dead Code Elimination**: Knip integration for identifying unused code
- **TypeScript Strict Mode**: Full compliance with strict type checking
- **Test Coverage**: Comprehensive tests for new features
- **Clean Architecture**: Improved separation of concerns

### Database Enhancements
- **OAuth Sessions Table**: Secure storage for OAuth tokens
- **Activity Tracking**: Enhanced metrics for trending calculations
- **Registry Integration**: New tables for registry server management
- **Migration Consolidation**: Cleaned up duplicate migrations

## 🔄 Migration Guide

### Upgrading from v2.6.x

1. **Pull the latest version**:
   ```bash
   git pull origin main
   git checkout v2.7.0
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Run migrations**:
   ```bash
   pnpm db:migrate
   ```

4. **Build the application**:
   ```bash
   NODE_ENV=production pnpm build
   ```

5. **Restart the service**:
   ```bash
   sudo systemctl restart pluggedin
   ```

### Docker Users

```bash
docker pull ghcr.io/veriteknik/pluggedin-app:v2.7.0
docker-compose down
docker-compose up -d
```

## 🆕 New APIs

### Registry APIs
- `POST /api/registry/submit` - Submit server to registry
- `GET /api/registry/server/[id]` - Get registry server details
- `GET /api/registry/health` - Check registry connectivity

### OAuth APIs
- `POST /api/mcp/oauth/session` - Create OAuth session
- `GET /api/mcp/oauth/callback` - OAuth callback handler
- `DELETE /api/mcp/oauth/session/[id]` - Clear OAuth session

### Notification APIs
- `GET /api/notifications` - Get all notifications
- `POST /api/notifications/[id]/read` - Mark as read
- `DELETE /api/notifications/[id]` - Delete notification

### Analytics APIs
- `GET /api/trending/servers` - Get trending servers
- `GET /api/service/search` - Enhanced search with filters

## 🌐 Internationalization

All new features are fully translated in 6 languages:
- 🇺🇸 English
- 🇹🇷 Turkish
- 🇨🇳 Chinese
- 🇯🇵 Japanese
- 🇮🇳 Hindi
- 🇳🇱 Dutch

## 🐛 Bug Fixes

- Fixed syntax errors from automated console.log removal
- Resolved OAuth state management issues
- Fixed registry submission error handling
- Corrected server claiming functionality
- Fixed environment variable configuration in wizard
- Resolved LLM provider mapping in playground

## 🙏 Acknowledgments

This release represents months of hard work and wouldn't have been possible without:
- The MCP community for feedback and testing
- Contributors who reported issues and suggested improvements
- The original MCP Registry team for their foundational work

## 📝 What's Next

We're already working on exciting features for the next release:
- Advanced analytics dashboard
- Mobile application support
- Enterprise SSO integration
- Enhanced collaboration features

## 🌟 Get Involved

If you find plugged.in useful, please:
- ⭐ Star our repository on [GitHub](https://github.com/VeriTeknik/pluggedin-app)
- 🐛 Report issues or suggest features
- 🤝 Contribute to the project
- 📢 Share with the community

Thank you for being part of the plugged.in journey!

---

For detailed technical information, see the [CHANGELOG.md](./CHANGELOG.md) and [Migration Guide](./docs/archive/MIGRATION_GUIDE_v2.7.0.md).