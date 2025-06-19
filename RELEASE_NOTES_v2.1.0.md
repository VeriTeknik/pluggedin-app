# Release Notes - v2.1.0

Released: June 19, 2025

## 🎉 Overview

We're excited to announce the release of plugged.in App v2.1.0! This major update introduces powerful new features including RAG (Retrieval-Augmented Generation) support, a comprehensive notification system, document library management, and significant security enhancements.

## ✨ New Features

### 📚 Document Library with RAG Integration
- **Document Management**: Upload, organize, and manage documents in your workspace
- **RAG Support**: Leverage your documents as context for AI interactions in the MCP Playground
- **Multiple Format Support**: Upload PDFs, text files, markdown, and more
- **Workspace-Specific Collections**: Each project maintains its own document collection
- **Real-time Upload Progress**: Track document processing with live progress indicators

### 🔔 Notification System
- **MCP Activity Notifications**: Real-time notifications for tool calls, resource reads, and prompt executions
- **Custom Notifications**: Send notifications through the plugged.in system with optional email delivery
- **Notification Center**: Centralized hub to view and manage all notifications
- **Email Integration**: Optional email delivery for important notifications
- **Real-time Updates**: Live notification counts and instant updates

### 🚀 Progressive MCP Server Initialization
- **Faster Startup**: Initialize MCP servers progressively with configurable timeouts
- **Resilient Connections**: Continue with available servers even if some fail to initialize
- **Better Error Handling**: Detailed error messages for failed server connections
- **Performance Monitoring**: Track initialization times and success rates

### 📄 Legal and Compliance Pages
- **Terms of Service**: Comprehensive terms for platform usage
- **Privacy Policy**: Clear data handling and privacy commitments
- **Disclaimer**: Legal disclaimers and limitations
- **Contact Page**: Easy way for users to reach support

### ✉️ Email Verification System
- **Account Security**: Email verification for new registrations
- **Verification Flows**: Smooth email verification process
- **Resend Capability**: Option to resend verification emails

## 🔒 Security Enhancements

### Input Sanitization Improvements
- **HTML Sanitization**: Replaced custom sanitization with industry-standard `sanitize-html` library
- **Multi-pass Protection**: Prevents nested XSS attacks with comprehensive sanitization
- **Environment Variable Security**: Secure parsing using `dotenv` library
- **Validation Enhancements**: Strengthened input validation across all API endpoints

### API Security
- **Rate Limiting**: Enhanced rate limiting on sensitive endpoints
- **Authentication Improvements**: Stronger API key validation
- **Audit Logging**: Comprehensive logging for security monitoring
- **Error Message Sanitization**: Prevents information disclosure in error responses

## 🎨 UI/UX Improvements

### MCP Playground Redesign
- **Improved Layout**: Better organization of chat and configuration areas
- **Responsive Design**: Enhanced mobile and tablet experience
- **Sidebar Enhancements**: More intuitive navigation and server selection
- **Real-time Streaming**: Visual indicators for AI response streaming

### Settings Page Enhancements
- **Theme Customization**: New theme selection options
- **Language Support**: Expanded internationalization
- **Profile Management**: Improved profile and social settings
- **Appearance Controls**: Fine-grained UI customization options

### Notification UI
- **Bell Icon**: Real-time notification count in navigation
- **Notification Types**: Visual distinction between different notification types
- **Batch Actions**: Mark all as read or delete all notifications
- **Time Formatting**: Relative time display with locale support

## 🐛 Bug Fixes

- Fixed JSON-RPC protocol interference in MCP proxy
- Resolved localhost URL validation issues for development environments
- Fixed API key sanitization in inspector scripts
- Corrected environment variable loading in MCP proxy
- Fixed streaming message handling in playground
- Resolved memory leaks in long-running sessions
- Fixed import sorting and linting issues

## 🔄 API Changes

### New API Endpoints
- `POST /api/rag/query` - Query documents with RAG
- `POST /api/notifications/mcp-activity` - Log MCP activity notifications
- `POST /api/notifications/custom` - Send custom notifications
- `GET/POST /api/library` - Document library management
- `GET /api/library/download/[uuid]` - Download documents
- `GET /api/upload-status/[uploadId]` - Track upload progress

### Updated Endpoints
- Enhanced security on all authentication endpoints
- Improved error responses with consistent formatting
- Added rate limiting headers to API responses

## 🔧 Technical Improvements

- **TypeScript Updates**: Improved type safety across the codebase
- **Performance Optimizations**: Reduced memory usage in playground sessions
- **Build Improvements**: Faster build times with optimized imports
- **Testing Infrastructure**: Enhanced test coverage for critical paths
- **Logging Enhancements**: Better structured logging for debugging

## 📦 Dependencies

### Added
- `sanitize-html`: ^2.17.0
- `@types/sanitize-html`: ^2.16.0

### Updated
- Various security and performance-related dependency updates

## 🚀 Upgrading from v1.0.0

### For Self-Hosted Installations

1. **Backup your database** before upgrading
2. Update your environment variables:
   ```bash
   # No new required variables for this release
   ```
3. Run database migrations:
   ```bash
   pnpm db:migrate
   ```
4. Rebuild and restart:
   ```bash
   pnpm build
   pnpm start
   ```

### For Docker Users

1. Pull the latest image:
   ```bash
   docker pull ghcr.io/veriteknik/pluggedin-app:v2.1.0
   ```
2. Restart your containers:
   ```bash
   docker-compose down
   docker-compose up -d
   ```

## 🙏 Acknowledgments

Special thanks to all contributors who made this release possible:
- Security improvements and RAG implementation
- UI/UX enhancements by @serhat-yildiz
- Notification system implementation
- Documentation improvements

## 📚 Documentation

For detailed documentation on new features:
- [RAG Integration Guide](https://docs.plugged.in/features/rag)
- [Notification System](https://docs.plugged.in/features/notifications)
- [Document Library](https://docs.plugged.in/features/library)

## 🔗 Related Updates

- **pluggedin-mcp v2.0.0**: Updated MCP proxy with notification support and security fixes
- See [MCP Proxy Release Notes](https://github.com/VeriTeknik/pluggedin-mcp/releases/tag/v2.0.0)

---

For questions or issues, please visit our [GitHub Issues](https://github.com/VeriTeknik/pluggedin-app/issues) page.