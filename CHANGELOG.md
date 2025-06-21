# Changelog

All notable changes to the Plugged.in platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

## [2.1.0] - Previous Release

### Added
- Social platform features
- User profiles and follow system
- Internationalization support for 6 languages
- RAG integration with document library
- MCP notification system
- Progressive server initialization

### Changed
- Evolved from simple MCP proxy to full social platform
- Enhanced security with rate limiting and input sanitization

### Fixed
- Various stability improvements and bug fixes