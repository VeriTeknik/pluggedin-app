# Plugged.in Registry Features Documentation

## Overview

The Plugged.in Registry is a comprehensive system for discovering, sharing, and managing Model Context Protocol (MCP) servers. It consists of three main components:

1. **Official Registry** (registry.plugged.in) - Curated, verified MCP servers
2. **Community Servers** - User-submitted servers pending verification
3. **Local Servers** - Private servers for individual use

## Key Features

### 1. Add Server to Registry

**Purpose**: Submit your MCP server to the official registry for global discovery.

**Process**:
1. Navigate to MCP Servers → Add to Registry
2. Enter your GitHub repository URL
3. System auto-detects:
   - Package type (npm, docker, pypi)
   - Environment variables
   - Available transports (STDIO, SSE, Streamable HTTP)
4. Review and confirm details
5. Submit for registry publication

**Requirements**:
- GitHub repository ownership
- Valid package.json/Dockerfile/setup.py
- Connected GitHub account

### 2. Community Servers

**Purpose**: Share servers with the community before official registry approval.

**Features**:
- Quick sharing without verification
- Public discovery through search
- Can be claimed by repository owners
- Automatic migration to registry upon claiming

**Process**:
1. Navigate to Search → Add to Community
2. Fill in server details
3. Submit for immediate availability

### 3. Server Claiming

**Purpose**: Claim ownership of community servers and publish to official registry.

**Process**:
1. Find your server in community listings
2. Click "Claim This Server"
3. Verify GitHub ownership
4. Server is:
   - Published to official registry
   - Statistics migrated
   - Removed from community

**Benefits**:
- Establish ownership
- Get official verification
- Maintain installation statistics

### 4. Enhanced Search

**Features**:
- **Multi-source search**: Registry, Community, or All
- **Package filters**: npm, docker, pypi
- **Repository filters**: GitHub, GitLab, etc.
- **Sort options**: Relevance, Recent, Popular
- **Real-time results**: Instant filtering
- **Rich metadata**: Ratings, installations, descriptions

**Search UI**:
```
[Search Box] [Source Dropdown] [Filters]
- Package Registry: npm/docker/pypi
- Repository Source: github.com/gitlab.com
- Sort: relevance/recent
```

### 5. Server Statistics

**Tracked Metrics**:
- Installation count
- Average rating (1-5 stars)
- Number of ratings
- Activity logs
- Trending status

**Migration**: Statistics automatically migrate when:
- Community server is claimed
- Server moves between sources
- Duplicate servers are consolidated

## API Endpoints

### Public Search API

```http
GET /api/service/search
```

**Query Parameters**:
- `query` - Search term
- `source` - REGISTRY, COMMUNITY, or omit for all
- `packageRegistry` - npm, docker, pypi
- `repositorySource` - github.com, gitlab.com
- `sort` - relevance, recent
- `offset` - Pagination offset
- `pageSize` - Results per page (default: 10)

**Response**:
```json
{
  "results": {
    "server-id": {
      "name": "Server Name",
      "description": "Description",
      "source": "REGISTRY",
      "package_registry": "npm",
      "installation_count": 100,
      "rating": 4.5,
      "ratingCount": 10
    }
  },
  "total": 50,
  "offset": 0,
  "pageSize": 10,
  "hasMore": true
}
```

### Registry Integration

The system integrates with registry.plugged.in through:
- **Standard API**: For general operations
- **VP (View/Performance) API**: For enhanced search with server-side filtering

## Server Actions

### `addServerToRegistry`
Submits a server to the official registry.

**Parameters**:
- `wizardData` - Configuration from wizard
- `profileUuid` - User's active profile

**Process**:
1. Validates user authentication
2. Verifies GitHub ownership
3. Extracts package information
4. Publishes to registry
5. Creates local reference

### `claimCommunityServer`
Claims ownership of a community server.

**Parameters**:
- `communityServerUuid` - Server to claim
- `repositoryUrl` - GitHub repository URL

**Process**:
1. Verifies ownership
2. Publishes to registry
3. Migrates statistics
4. Removes from community

### `verifyGitHubOwnership`
Verifies user owns or has admin access to repository.

**Parameters**:
- `registryToken` - GitHub OAuth token
- `repoUrl` - Repository URL

**Returns**:
- `isOwner` - Boolean ownership status
- `githubUsername` - Authenticated user
- `reason` - Failure reason if not owner

## Database Schema

### Registry Servers Table
```sql
CREATE TABLE registry_servers (
  uuid UUID PRIMARY KEY,
  registry_id TEXT,
  name TEXT NOT NULL,
  github_owner TEXT NOT NULL,
  github_repo TEXT NOT NULL,
  repository_url TEXT NOT NULL,
  description TEXT,
  is_claimed BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT false,
  claimed_by_user_id TEXT,
  claimed_at TIMESTAMP,
  published_at TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Shared MCP Servers Table
```sql
CREATE TABLE shared_mcp_servers (
  uuid UUID PRIMARY KEY,
  server_uuid UUID REFERENCES mcp_servers(uuid),
  profile_uuid UUID REFERENCES profiles(uuid),
  title TEXT NOT NULL,
  description TEXT,
  template JSONB NOT NULL,
  is_public BOOLEAN DEFAULT true,
  is_claimed BOOLEAN DEFAULT false,
  claimed_by_user_id TEXT,
  claimed_at TIMESTAMP,
  registry_server_uuid UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## Security Considerations

### Authentication
- GitHub OAuth required for:
  - Adding to registry
  - Claiming servers
  - Verifying ownership
- JWT tokens for API access
- Session validation for all mutations

### Authorization
- Repository admin permissions required
- Organization membership validated
- Profile ownership verified

### Input Validation
- Zod schemas for all inputs
- GitHub URL format validation
- Package name sanitization
- XSS prevention

## Best Practices

### For Server Authors
1. **Use semantic versioning** in package.json
2. **Document environment variables** clearly
3. **Include comprehensive README**
4. **Test all transport methods**
5. **Provide example configurations**

### For Platform Users
1. **Verify server authenticity** before installation
2. **Check ratings and reviews**
3. **Review required permissions**
4. **Test in development first**
5. **Report issues to authors**

## Troubleshooting

### Common Issues

**"Repository not found"**
- Ensure repository is public
- Check URL format: `https://github.com/owner/repo`
- Verify GitHub token is valid

**"Not authorized to claim"**
- Must have admin permissions
- Check organization membership
- Ensure correct GitHub account

**"Server already exists"**
- Check if already in registry
- Search for duplicates
- Contact support for consolidation

### Debug Information

Enable debug logging:
```javascript
// In server actions
console.log('🔍 Debug:', { step, data });
```

Check browser console for:
- API response codes
- Validation errors
- Network failures

## Future Enhancements

### Planned Features
1. **Automated testing** of submitted servers
2. **Version management** with update notifications
3. **Dependency tracking** for server requirements
4. **Performance metrics** and benchmarks
5. **Advanced analytics** for server authors

### API Expansions
1. **Bulk operations** for multiple servers
2. **Webhook notifications** for updates
3. **GraphQL endpoint** for flexible queries
4. **Server health monitoring**
5. **Usage analytics API**

## Migration Guide

### From Community to Registry
1. Claim your server through UI
2. Statistics migrate automatically
3. Update documentation with registry URL
4. Notify users of new location

### From Local to Registry
1. Use "Add to Registry" wizard
2. Ensure repository is ready
3. Test all configurations
4. Submit for publication

## Support

### Resources
- **Documentation**: docs.plugged.in
- **GitHub Issues**: github.com/pluggedin/app/issues
- **Discord**: discord.gg/pluggedin
- **Email**: support@plugged.in

### Reporting Issues
Include:
- Server UUID or registry ID
- Error messages
- Browser console logs
- Steps to reproduce