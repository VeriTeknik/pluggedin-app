# plugged.in App v2.1.0 🚀

## What's New

### 📚 RAG-Powered Document Library
Upload and manage documents in your workspace, then leverage them as context for AI interactions. Your documents become part of your AI's knowledge base, enabling more informed and contextual responses.

### 🔔 Real-Time Notification System
Stay informed with comprehensive notifications for MCP activities, custom alerts, and system events. Optional email delivery ensures you never miss important updates.

### 🔒 Enhanced Security
- Industry-standard HTML sanitization with `sanitize-html`
- Secure environment variable parsing
- Comprehensive input validation
- Rate limiting and audit logging

### 🎨 UI/UX Improvements
- Redesigned MCP Playground with better layout and responsiveness
- Enhanced settings page with theme customization
- Real-time notification bell with count updates
- Improved error handling and user feedback

## Installation & Upgrade

### Self-Hosted
```bash
# Backup your database first!
git pull origin main
pnpm install
pnpm db:migrate
pnpm build
pnpm start
```

### Docker
```bash
docker pull ghcr.io/veriteknik/pluggedin-app:v2.1.0
docker-compose down && docker-compose up -d
```

## Breaking Changes
None - This release maintains full backward compatibility with v1.0.0

## Bug Fixes
- Fixed JSON-RPC protocol interference in MCP proxy
- Resolved localhost URL validation for development
- Fixed memory leaks in long-running sessions
- Corrected streaming message handling

## Contributors
Thanks to everyone who contributed to this release! Special mentions:
- UI/UX improvements by @serhat-yildiz
- Security enhancements and RAG implementation
- Community feedback and bug reports

## Related Updates
- **pluggedin-mcp v2.0.0**: Updated proxy with notification support
- See full changelog in [RELEASE_NOTES_v2.1.0.md](./RELEASE_NOTES_v2.1.0.md)

## Links
- 📖 [Documentation](https://docs.plugged.in)
- 🐛 [Report Issues](https://github.com/VeriTeknik/pluggedin-app/issues)
- 💬 [Discussions](https://github.com/VeriTeknik/pluggedin-app/discussions)

---

**Full Changelog**: https://github.com/VeriTeknik/pluggedin-app/compare/v1.0.0...v2.1.0