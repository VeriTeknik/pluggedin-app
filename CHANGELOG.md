# Changelog

All notable changes to the Plugged.in platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Streamable HTTP Transport Support**: Full support for the new MCP Streamable HTTP transport protocol
  - Added STREAMABLE_HTTP to McpServerType enum
  - Database schema updated with oauth_token, headers, and session_id fields
  - New StreamableHttpServerForm component for configuring Streamable HTTP servers
  - Integration with @h1deya/langchain-mcp-tools v0.2.7 for Streamable HTTP support
  - Support for OAuth 2.1 authorization flows
  - Custom headers configuration for authentication
  - Session management with Mcp-Session-Id headers
- **Enhanced MCP Server Management**
  - Updated server forms to include new transport type tab
  - Import/export functionality now supports Streamable HTTP configurations
  - Progressive initialization supports new transport type
- **Internationalization Updates**
  - Added translations for Streamable HTTP features in all supported languages (en, tr, zh, ja, hi, nl)
  - New translation keys: streamableHttp, streamableHttpBased, headers, sessionId

### Changed
- Updated @modelcontextprotocol/sdk from ^1.8.0 to ^1.13.0
- Updated @h1deya/langchain-mcp-tools from ^0.2.4 to ^0.2.7
- Enhanced client-wrapper.ts to handle Streamable HTTP transport configuration
- Improved collection import to properly handle server types and new fields

### Fixed
- Collection import now correctly uses the server type from imported data instead of defaulting to STDIO

## [2.2.0] - 2025-06-21

### Added
- **MCP Server Data Encryption**: Implemented AES-256-GCM encryption for sensitive MCP server data
  - Encrypts `command`, `args`, `env`, and `url` fields
  - Per-profile encryption with derived keys for enhanced security
  - Transparent encryption/decryption for seamless user experience
  - Sanitized templates for secure server sharing

### Changed
- Database schema updated to support encrypted fields
- MCP API endpoints now decrypt data before sending to proxy
- Update operations properly handle encryption for sensitive fields

### Fixed
- Fixed MCP server update issue where arguments would revert to previous values
- Fixed "Session not found" error when using MCP proxy with encrypted servers

### Security
- All sensitive MCP server configuration data is now encrypted at rest
- Only the profile owner can decrypt and use their servers
- Shared servers expose sanitized templates without sensitive information

## [2.1.0] - 2025-06-19

### Added
- **RAG-Powered Document Library**: Upload and manage documents as context for AI interactions
- **Real-Time Notification System**: Comprehensive notifications with optional email delivery
- **Progressive Server Initialization**: Faster startup with resilient server connections
- **Theme Customization**: Enhanced settings page with theme options
- **Notification Bell**: Real-time notification count updates in UI

### Changed
- Redesigned MCP Playground with better layout and responsiveness
- Enhanced error handling and user feedback throughout the application
- Improved memory management for long-running sessions

### Fixed
- Fixed JSON-RPC protocol interference in MCP proxy
- Resolved localhost URL validation for development
- Fixed memory leaks in long-running sessions
- Corrected streaming message handling

### Security
- Industry-standard HTML sanitization with `sanitize-html`
- Secure environment variable parsing
- Comprehensive input validation
- Rate limiting and audit logging

## [1.0.0] - 2025-04-14

### Added
- **Social Features**: User profiles, MCP server sharing, and community discovery
- **Collections Management**: Group and share curated sets of MCP servers
- **Public/Private Controls**: Granular privacy settings for shared content
- **Attribution System**: Proper credit for shared content creators
- **Custom Instructions**: Fine-tune how MCP servers respond
- **Resource Templates**: Create and share templates for common resources
- **Internationalization**: Support for English, Turkish, Chinese, Hindi, Japanese, and Dutch
- **User Profiles**: Dedicated profile pages at `/to/username`
- **Export/Import**: Backup or share entire collections
- **Usage Analytics**: Track installation and usage of shared content

### Changed
- Upgraded to React 19 for performance improvements
- Restructured database schema to support social features
- Enhanced API endpoints for sharing and discovery
- Improved state management for better performance
- Optimized bundle sizes for faster loading

### Fixed
- Profile images display issues
- Collection export performance for large collections
- Various UI translation completeness

## [0.4.5] - 2025-04-02 (Pre-release)

### Added
- **Full MCP Specification Compatibility**: Complete support for MCP prompts, custom instructions, tools, and resources
- **Capability Discovery & Storage**: Comprehensive discovery for Tools, Resources, Resource Templates, and Prompts
- **Custom Instructions**: Backend and frontend implementation for server-specific instructions
- **Server Detail UI Enhancements**: Tabs to display discovered capabilities
- **Discovery Button**: Manual capability discovery on server detail page
- **Release Notes System**: Complete release notes with filtering, search, and pagination
- **API-Driven Architecture**: New endpoints for proxy capability listing and resolution

### Changed
- Moved all capability discovery to pluggedin-app for improved startup time
- Database schema updates with promptsTable and customInstructionsTable

### Fixed
- Dynamic route parameter access using await params pattern
- Data transformation in custom instruction API route
- Server Notes functionality verification and fixes

### Breaking Changes
- Full compatibility with MCP specifications requires updating both pluggedin-app and pluggedin-mcp