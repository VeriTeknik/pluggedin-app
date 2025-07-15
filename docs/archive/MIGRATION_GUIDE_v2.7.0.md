# Migration Guide: v2.6.2 → v2.7.0

## Overview

Version 2.7.0 introduces the Registry v2 integration with the Smart Server Wizard, OAuth support, trending servers, and enhanced security features. This guide will help you migrate from v2.6.2 to v2.7.0.

## Breaking Changes

None - v2.7.0 is fully backward compatible with v2.6.2.

## New Features

### 1. Smart Server Wizard

The new Smart Server Wizard provides an intelligent, multi-step interface for creating and claiming MCP servers:

- **Automatic GitHub Verification**: Claims servers by verifying GitHub ownership
- **Environment Variable Detection**: Automatically detects required environment variables
- **Registry Submission**: Submit servers directly to the Plugged.in Registry
- **Discovery Testing**: Test server capabilities before saving

**Usage**: Click the "Smart Wizard" button when creating a new MCP server.

### 2. OAuth Integration

Full OAuth support for Streamable HTTP MCP servers:

- **Session Management**: Secure OAuth session handling with PostgreSQL storage
- **Token Management**: Automatic token refresh and cleanup
- **Multiple Providers**: Support for GitHub, Linear, and other OAuth providers

**Configuration**: OAuth settings are automatically detected and configured through the wizard.

### 3. Trending Servers

Discover popular MCP servers based on real-time activity:

- **Activity Tracking**: Monitors installation and usage patterns
- **Smart Sorting**: Servers ranked by recent activity and popularity
- **Real-time Updates**: Trending data updates automatically

**Access**: View trending servers on the search page.

### 4. Enhanced Security

Comprehensive security improvements:

- **Zod Validation**: All server actions now use strict schema validation
- **XSS Prevention**: Removed all dangerouslySetInnerHTML usage
- **Input Sanitization**: Enhanced validation for all user inputs

## Migration Steps

### For Docker Users

```bash
# Pull the latest image
docker pull ghcr.io/veriteknik/pluggedin-app:v2.7.0

# Stop the current container
docker-compose down

# Update your docker-compose.yml to use v2.7.0
# Then start the new version
docker-compose up -d
```

### For Manual Deployments

1. **Backup your database**:
   ```bash
   pg_dump -U your_user -d pluggedin > backup_v2.6.2.sql
   ```

2. **Update the codebase**:
   ```bash
   git fetch origin
   git checkout v2.7.0
   ```

3. **Install dependencies**:
   ```bash
   pnpm install
   ```

4. **Run database migrations**:
   ```bash
   pnpm db:migrate
   ```

5. **Build the application**:
   ```bash
   NODE_ENV=production pnpm build
   ```

6. **Restart the service**:
   ```bash
   sudo systemctl restart pluggedin
   ```

## Database Migrations

The following migrations will be applied automatically:

1. **OAuth Sessions Table**: Stores OAuth session data
2. **Activity Tracking**: Enhanced metrics for trending calculations
3. **Language Support**: Additional language columns for profiles
4. **Consolidated Migrations**: Cleaned up duplicate migration numbers

## Configuration Changes

No new required environment variables. Optional configurations:

```bash
# Optional: Registry submission token (for automated submissions)
REGISTRY_AUTH_TOKEN=your-registry-token

# Optional: OAuth callback URL (defaults to NEXTAUTH_URL)
OAUTH_CALLBACK_URL=https://your-domain.com
```

## API Changes

### New Endpoints

- `POST /api/oauth/session` - Create OAuth session
- `GET /api/oauth/session/:sessionId` - Get OAuth session status
- `DELETE /api/oauth/session/:sessionId` - Clear OAuth session
- `GET /api/trending` - Get trending servers
- `POST /api/registry/submit` - Submit server to registry

### Updated Endpoints

- `/api/search` - Now includes trending data in results
- `/api/servers` - Enhanced with ownership verification

## Testing Your Migration

After migration, verify:

1. **Existing Servers**: All MCP servers should continue working
2. **Authentication**: Users can still log in with existing credentials
3. **Profiles**: All profile data is intact
4. **Collections**: Shared collections remain accessible
5. **New Features**: Test the Smart Wizard and trending servers

## Rollback Procedure

If you need to rollback to v2.6.2:

```bash
# Restore database backup
psql -U your_user -d pluggedin < backup_v2.6.2.sql

# Checkout previous version
git checkout v2.6.2

# Rebuild
pnpm install
NODE_ENV=production pnpm build

# Restart
sudo systemctl restart pluggedin
```

## Support

If you encounter any issues during migration:

1. Check the logs: `journalctl -u pluggedin -f`
2. Review error messages in the browser console
3. Open an issue on GitHub with migration details

## Performance Improvements

v2.7.0 includes several performance optimizations:

- **Reduced Bundle Size**: Removed unused code and dependencies
- **Optimized Queries**: Better indexing for trending calculations
- **Faster Search**: Enhanced filtering and sorting algorithms
- **Code Cleanup**: Removed console.log statements and dead code

## Security Notes

This version includes important security fixes:

- Input validation has been strengthened across all forms
- XSS vulnerabilities have been patched
- OAuth tokens are now properly secured and cleaned up
- All server actions use Zod validation schemas

We recommend upgrading to v2.7.0 as soon as possible to benefit from these security improvements.