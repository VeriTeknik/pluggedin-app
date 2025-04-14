# Sharing MCP Servers in Plugged.in

This document explains how MCP server sharing works in Plugged.in, focusing on security practices and how sensitive information is handled.

## Security Overview

When you share an MCP server in Plugged.in, we prioritize security by ensuring that sensitive information like credentials, API keys, and private URLs are never exposed to other users.

### What Information is Shared?

When you share a server, the following information is shared:

- Server title and description (as you enter them when sharing)
- Server type (STDIO or SSE)
- Basic command and arguments structure
- URL structure (with credentials removed)

### What Information is NOT Shared?

We explicitly protect the following sensitive information:

- Passwords and API keys in database URLs
- Environment variables containing secrets
- Authentication tokens
- Private API keys
- Any other credentials

## How Sanitization Works

When you share an MCP server, Plugged.in automatically performs these security measures:

1. **Template Creation**: We create a sanitized template of your server configuration
2. **Credential Removal**: Any passwords in connection strings are replaced with placeholders
3. **Environment Variable Protection**: Sensitive environment variables are replaced with descriptive placeholders
4. **API Key Protection**: API keys in URLs or parameters are removed

### Example of Sanitization

Original connection string:
```
postgresql://postgres:MySecretPassword123!@database.example.com:5432/my_database
```

Sanitized version shared with others:
```
postgresql://postgres:<YOUR_PASSWORD>@database.example.com:5432/my_database
```

## When Importing Shared Servers

When someone imports a server you've shared:

1. They receive the sanitized template with placeholders
2. They must provide their own credentials to make the server work
3. The template serves as a guide for proper configuration
4. A note indicates that the server was imported from a shared template

## Best Practices

Even with these protections in place, it's good practice to:

1. Review what you're sharing before sharing it
2. Use descriptive titles and descriptions to help others understand the purpose of the server
3. Consider adding setup instructions in the description if there are specific requirements

## Questions or Concerns

If you have any questions or concerns about server sharing security, please contact us at support@plugged.in. 