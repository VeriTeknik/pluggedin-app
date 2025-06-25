# Changelog

All notable changes to the Plugged.in platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.4.0] - 2025-01-26

### Added
- **Enhanced Authentication UI**
  - New `AuthLayout` component with network animation background
  - Unified authentication form component (`AuthForm`) across all auth pages
  - Loading indicators and improved user feedback on email verification
  - Consistent link configuration across authentication flows
- **Documentation Updates**
  - New images for What's New pages showcasing latest features
  - Enhanced Getting Started page with updated setup guide images
  - Visual guides for collection sharing, server capabilities, and multilingual support
  - Updated screenshots for public profiles and import/export functionality

### Changed
- Refactored all authentication pages (login, register, forgot-password, etc.) to use shared `AuthLayout`
- Improved language update logic in authentication flows
- Enhanced error handling and user feedback across authentication forms
- Updated all language translations for authentication pages
- Removed obsolete start script and added dynamic exports to WhatsNew pages

### Fixed
- Language persistence issues during authentication flows
- Form validation and error display consistency
- Loading state management in authentication forms

## [2.3.0] - 2025-01-25

### Added
- **Security Validations for MCP Servers**
  - URL validation with SSRF protection for SSE and Streamable HTTP servers
  - Command allowlisting for STDIO servers (node, npx, python, python3, uv, uvx, uvenv)  
  - Header validation and sanitization for Streamable HTTP configurations
  - Centralized security validators in `lib/security/validators.ts`
  - Validation in createMcpServer, updateMcpServer, and bulkImportMcpServers
- **Enhanced Notifications System**
  - Custom notification titles with localization support
  - Filtering and sorting capabilities (by severity, date)
  - Search functionality for notifications
  - Refresh button for instant updates (RefreshCw icon)
  - Protection for custom notifications from bulk deletion
  - Faster polling interval reduced from 60 to 15 seconds
  - Improved UI with better spacing and controls
- **Streamable HTTP Transport Improvements**
  - Better support for session management options
  - Improved transport configuration UI
  - Enhanced error messages for connection failures
  - Backward compatibility for legacy transport options

### Changed
- Updated notification provider polling interval for better responsiveness
- Improved Turkish and other language localizations for notifications
- Enhanced error handling in MCP server creation and updates
- Better separation of transport options from environment variables
- Refined bulk import to validate and skip invalid servers
- Updated test infrastructure to work with new validations
- Improved error messages to be more user-friendly

### Fixed
- Missing translation keys in notifications page:
  - `notifications.status.unread` instead of `status.unread`
  - `notifications.actions.markAsRead` instead of `actions.markAsRead`
  - `notifications.actions.delete` instead of `actions.delete`
- Turkish localization not working for custom notifications
- Docker build issues with NextJS static generation
- Notification translation namespace consistency
- Streamable HTTP integration tests compatibility
- Test failures after security validation implementation

### Security
- All MCP server URLs now validated against SSRF attacks
- Command injection protection through strict allowlisting
- Header injection prevention for Streamable HTTP
- Input sanitization for all server configurations
- Protection against private IP access and dangerous ports
- RFC 7230 compliant header validation
- Control character detection in headers

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