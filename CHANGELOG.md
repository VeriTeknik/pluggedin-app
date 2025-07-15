# Changelog

All notable changes to the Plugged.in platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Smart Server Wizard**: Comprehensive multi-step wizard for MCP server creation and claiming
  - Automatic GitHub ownership verification for claimed servers
  - Environment variable detection and configuration
  - Registry submission with progress tracking
  - Discovery testing step with real-time validation
  - Support for npm, Docker, PyPI, and GitHub deployments
- **OAuth Integration**: Streamable HTTP OAuth support for MCP servers
  - Session management with PostgreSQL and in-memory caching
  - OAuth state management and token handling
  - Automatic token clearing and session cleanup
  - Support for GitHub and other OAuth providers
- **Trending Servers**: Activity-based trending server discovery
  - Real-time activity tracking and calculations
  - Server metrics tracking with installation counts
  - Enhanced sorting functionality for better discovery
- **Enhanced Registry Integration**
  - Improved registry server handling with simplified display names
  - Registry token authentication for submissions
  - Better error handling for GitHub token authentication
  - Support for new registry schema and transport types
- **API Reference Page**: New comprehensive API documentation with metadata
- **Testing Infrastructure**: Comprehensive test coverage for registry features
- **Profile Language API**: Language preference storage per user profile

### Changed
- **Search Functionality**: Refactored to remove 'latest only' filter with enhanced server-side filtering
- **Database Migrations**: Consolidated multiple migrations and added missing language support
- **Security Enhancements**:
  - Added Zod validation to all server actions
  - Removed XSS vulnerabilities by eliminating dangerouslySetInnerHTML usage
  - Enhanced input validation across all forms
- **Code Quality Improvements**:
  - Removed all console.log statements from production code
  - Cleaned up unused files, exports, and type definitions
  - Removed unused dependencies (Knip integration)
  - Improved error handling with standardized responses
- **UI/UX Enhancements**:
  - Improved StreamingCliToast connection handling
  - Enhanced wizard UI consistency across all steps
  - Better transport configuration handling

### Fixed
- Syntax errors from automated console.log removal
- OAuth state management issues
- Registry submission error handling
- Server claiming functionality for community servers
- Environment variable configuration in wizard
- LLM provider mapping in playground sessions

### Security
- Comprehensive Zod validation schemas for all user inputs
- XSS vulnerability fixes by removing dangerous HTML rendering
- Enhanced OAuth token security with proper cleanup
- Input sanitization improvements across all forms

### Performance
- Optimized activity tracking queries
- Improved trending server calculations
- Enhanced search performance with better indexing
- Reduced bundle size by removing unused code

## [2.6.2] - 2025-01-03

### Fixed
- Fixed "SSEClientTransport already started" errors for Streamable HTTP connections
- Resolved connection timeout issues during MCP server discovery
- Fixed retry logic to create fresh client/transport instances on each attempt

### Changed
- Updated MCP SDK from 1.13.1 to 1.13.3 for improved stability
- Added default headers for all Streamable HTTP connections (Accept and User-Agent)
- Implemented 30-second default timeout for all Streamable HTTP connections
- Enhanced retry mechanism to avoid transport state conflicts

## [2.6.1] - 2025-01-03

### Added
- **SSE Transport Deprecation Support**
  - Visual deprecation warnings in UI for SSE servers
  - Migration buttons to convert SSE to Streamable HTTP
  - Auto-migration for Context7 servers from SSE to Streamable HTTP
  - Console warnings when SSE transport is used
  - Migration server actions for bulk SSE conversion

### Fixed
- Context7 MCP server now correctly detected as Streamable HTTP with SSE streaming capability
- Added proper Accept headers for Context7 (`application/json, text/event-stream`)
- Fixed test connection logic to handle Streamable HTTP servers with SSE streaming

### Changed
- Updated smart-server-dialog to support new MCP registry schema
- Added support for 'streamable' transport type from new registry format
- Added handling for remotes section in server configurations
- Improved server type detection logic for known MCP endpoints
- Context7 is now classified as Streamable HTTP (not SSE) per official MCP spec
- Enhanced UI to show deprecation badges and warnings for SSE servers

## [2.6.0] - 2025-01-03

### Added
- **High-Performance Package Management System**
  - Isolated package installation per MCP server using pnpm
  - Support for npm/npx/pnpm commands with 10-100x faster installs
  - Python package management with uv (100x faster than pip)
  - Automatic package directory detection per OS
  - Smart command transformation for registry servers
  - Package caching with content-addressable storage
- **CLI-Style Discovery Toast**
  - Terminal-style toast notification for MCP discovery output
  - Real-time log streaming with animated display
  - Color-coded output based on log types (Action, PackageManager, pnpm, etc.)
  - JSON formatting for structured data
  - Auto-scroll to bottom with custom terminal-themed scrollbar
  - Console capture utility for discovery process logging
- **Registry Integration Improvements**
  - Enhanced server detail dialog with full registry server support
  - Fixed registry server import using official transformer
  - Proper handling of registry servers with package dependencies
  - Dynamic command/args display in configuration UI

### Changed
- **Package Manager Enhancements**
  - Fixed npx flag parsing (-y, --yes, etc. no longer treated as packages)
  - Improved binary detection for npx-only packages
  - Keep using npx command for packages without binaries
  - Better error handling for package installation failures
- **UI/UX Improvements**
  - Optimized CLI toast performance with faster animations
  - Fixed height issues in toast notifications
  - Added "Processing..." indicator for ongoing operations
  - Improved scrolling behavior for long outputs

### Fixed
- Fixed MCP discovery errors where npx flags were incorrectly parsed as package names
- Fixed binary not found errors for npx-only packages
- Fixed registry server command transformation issues
- Fixed duplicate variable declarations in package manager
- Fixed CLI toast height and scrolling issues

### Security
- Package isolation per MCP server for enhanced security
- Separate installation directories prevent package conflicts
- Environment-based configuration for resource limits

## [2.5.0] - 2025-01-26

### Added
- **Discovery Performance Optimizations**
  - Smart discovery throttling to prevent redundant API calls
  - In-memory caching for recent discovery attempts
  - Optimized database queries with single LEFT JOIN operations
  - Enhanced error recovery with automatic retry mechanisms
  - Comprehensive discovery status tracking and logging

### Changed
- **API Performance Improvements**
  - Tools API (`/api/tools`) now implements 5-minute throttling for automatic discovery
  - Discovery API (`/api/discover`) uses 2-minute throttling for explicit requests
  - Single database query fetches server data and tool counts together
  - Asynchronous discovery processing with improved error handling
- **Enhanced User Experience**
  - Faster API response times through optimized queries
  - Clear feedback on discovery progress and throttling status
  - Intelligent failure recovery with faster retry mechanisms
  - Better scalability for concurrent discovery requests

### Fixed
- Eliminated redundant discovery calls that could overwhelm the system
- Resolved race conditions in concurrent discovery requests
- Fixed database query inefficiencies in tool count operations
- Improved memory management for discovery attempt tracking

### Performance
- **5-10x reduction** in redundant discovery calls
- **~50% faster** API response times through query optimization
- **Zero duplicate work** through intelligent throttling
- **Better scalability** for high-concurrency scenarios

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