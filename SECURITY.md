# Security Policy

## Overview

Plugged.in takes security seriously as a collaborative platform for the Model Context Protocol (MCP) ecosystem. This document outlines our security measures, policies, and procedures to ensure the safety and privacy of our users and their data.

## Table of Contents

1. [Reporting Security Vulnerabilities](#reporting-security-vulnerabilities)
2. [Security Measures](#security-measures)
3. [Authentication & Authorization](#authentication--authorization)
4. [Rate Limiting](#rate-limiting)
5. [Input Validation & Sanitization](#input-validation--sanitization)
6. [Data Protection](#data-protection)
7. [RAG Security](#rag-security)
8. [Monitoring & Auditing](#monitoring--auditing)
9. [Security Best Practices](#security-best-practices)
10. [Environment Security](#environment-security)
11. [Supported Versions](#supported-versions)

## Reporting Security Vulnerabilities

We take all security vulnerabilities seriously and appreciate your efforts to responsibly disclose your findings.

### How to Report

- **Email**: Send detailed reports to [security@plugged.in] (if available)
- **GitHub**: Create a private security advisory on GitHub
- **Priority**: Mark as urgent for critical vulnerabilities

### What to Include

1. **Description**: Clear description of the vulnerability
2. **Impact**: Potential impact and severity assessment
3. **Reproduction**: Step-by-step reproduction instructions
4. **Environment**: Affected versions and configurations
5. **Mitigation**: Suggested fixes or workarounds (if any)

### Response Timeline

- **Acknowledgment**: Within 24 hours
- **Initial Assessment**: Within 72 hours
- **Status Updates**: Weekly until resolved
- **Resolution**: Varies by severity (Critical: 7 days, High: 14 days, Medium: 30 days)

### Responsible Disclosure

- Allow reasonable time for investigation and patching
- Do not publicly disclose until fix is available
- Coordinate disclosure timeline with maintainers
- Credit will be given for responsible disclosure

## Security Measures

### Recent Security Audit (January 2025)

We conducted a comprehensive security audit and implemented critical fixes:

#### ✅ Completed Security Enhancements

1. **Critical XSS Vulnerability Fixes**
   - Fixed multiple Cross-Site Scripting vulnerabilities in OAuth callback routes
   - Created security utilities (`lib/security-utils.ts`) for proper HTML/JS encoding
   - Fixed template literal injections in `/api/auth/callback/registry/route.ts`
   - Fixed similar vulnerabilities in `/api/auth/github-popup-callback/route.ts`
   - Fixed XSS in `/api/mcp/oauth/callback/route.ts` success/error responses
   - Fixed XSS in `StreamableHTTPWrapper` OAuth redirect flow
   - Implemented proper escaping for all user-controlled data in HTML contexts

2. **SSRF (Server-Side Request Forgery) Prevention**
   - Fixed SSRF vulnerabilities in `/api/analyze-repository/route.ts`
   - Added GitHub URL validation and identifier verification
   - Implemented hostname verification for external API calls
   - Prevented unauthorized requests to internal networks

3. **URL Substring Sanitization Fixes**
   - Fixed incomplete URL validation in `StreamableHTTPWrapper.ts`
   - Fixed hostname checking in `trigger-mcp-oauth.ts`
   - Replaced unsafe `.includes()` checks with proper domain validation
   - Prevents subdomain attacks (e.g., `evil-github.com` matching `github.com`)

4. **Open Redirect Protection**
   - Added URL validation to prevent open redirect attacks
   - Implemented whitelist of allowed redirect hosts
   - Fixed unsafe redirects in OAuth callback flows
   - Validated localStorage-sourced URLs before redirection

5. **Comprehensive Security Headers**
   - Added complete security headers to all HTML responses:
     - Content-Security-Policy (CSP)
     - X-Content-Type-Options: nosniff
     - X-Frame-Options: DENY
     - X-XSS-Protection: 1; mode=block
     - Referrer-Policy: strict-origin-when-cross-origin
   - Created `getSecurityHeaders()` utility for consistent application

6. **Content Security Policy**
   - Added CSP headers to all HTML responses
   - Prevents inline script injection attacks
   - Restricts resource loading to trusted sources
   - Mitigates XSS attack vectors

7. **Test Endpoint Removal**
   - Removed exposed `/api/test-route` and `/api/test-error` endpoints
   - Eliminated potential attack vectors from development endpoints

8. **Comprehensive Rate Limiting**
   - Implemented tiered in-memory rate limiting with automatic cleanup
   - Auth endpoints: 5 requests per 15 minutes (strictest)
   - API endpoints: 60 requests per minute
   - Public endpoints: 100 requests per minute
   - Sensitive operations: 10 requests per hour

9. **Database Security**
   - Secured `/api/db-migrations` endpoint with `ADMIN_MIGRATION_SECRET`
   - Prevents unauthorized database modifications
   - Admin-only access for schema changes

10. **Error Response Standardization**
    - Created `lib/api-errors.ts` for consistent error handling
    - Prevents internal information disclosure
    - Sanitized error messages for security

11. **Authentication Security**
    - Enabled email verification requirement for user registration
    - Strengthened user identity verification process

12. **File Security**
    - Added path sanitization to file download endpoints
    - Prevents directory traversal attacks
    - Secure file access controls

13. **Environment Security**
    - Created comprehensive `.env.example` with security variables
    - Proper configuration guidance for production deployments

## Authentication & Authorization

### Authentication System
- **NextAuth.js**: Secure session management with encrypted tokens
- **Email Verification**: Required for all new user registrations
- **Session Encryption**: Uses `NEXTAUTH_SECRET` for secure session data
- **Secure Cookies**: HttpOnly, Secure, and SameSite cookie attributes

### Authorization Model
- **Resource Ownership**: Users → Projects → Profiles → Servers/Collections
- **Hierarchical Permissions**: Ownership-based access control
- **Sharing Controls**: Public/private flags with profile-based sharing
- **API Key Authentication**: Project-specific API keys for MCP operations

### Multi-Factor Authentication
- **Planned**: Two-factor authentication implementation
- **Current**: Email-based verification for sensitive operations

## Rate Limiting

### Implementation
- **In-Memory Storage**: Fast, efficient rate limiting
- **Automatic Cleanup**: Prevents memory leaks
- **Tiered Limits**: Different limits for different endpoint types
- **User-Based**: Limits applied per authenticated user

### Rate Limit Tiers

| Endpoint Type | Limit | Window | Description |
|---------------|-------|---------|-------------|
| Authentication | 5 requests | 15 minutes | Login, register, password reset |
| API Endpoints | 60 requests | 1 minute | General API operations |
| Public Endpoints | 100 requests | 1 minute | Public data access |
| Sensitive Operations | 10 requests | 1 hour | Admin functions, data exports |

### Rate Limit Headers
- `X-RateLimit-Limit`: Request limit for the current window
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Time until the rate limit resets

## Input Validation & Sanitization

### Validation Framework
- **Zod Schemas**: Type-safe runtime validation for all inputs
- **Server Actions**: Built-in validation for mutations
- **API Routes**: Comprehensive input validation
- **File Uploads**: MIME type and size validation

### Sanitization Measures
- **XSS Prevention**: Content filtering for script tags and JavaScript URLs
  - Use `escapeHtml()` from `lib/security-utils.ts` for HTML contexts
  - Use `encodeForJavaScript()` for JavaScript contexts
  - Never use template literals with user input in HTML/JS
  - Always validate and sanitize user input before display
- **SQL Injection Prevention**: Parameterized queries via Drizzle ORM
- **Path Traversal Protection**: File path sanitization
- **HTML Sanitization**: Safe rendering of user-generated content

### Input Limits
- **Query Length**: Maximum 1000 characters for search queries
- **File Size**: Configurable limits for uploads
- **Request Size**: Body size limits for API requests
- **Field Length**: Maximum lengths for form fields

## Data Protection

### Data Privacy
- **Project Isolation**: Users can only access their own project data
- **Encrypted Storage**: Sensitive data encrypted at rest
- **Secure Transmission**: HTTPS enforced for all communications
- **Access Logging**: Comprehensive audit trails for data access

### Personal Data
- **Minimal Collection**: Only collect necessary user information
- **User Control**: Users can update/delete their own data
- **Data Retention**: Configurable retention policies
- **Export/Import**: Users can export their data

### Database Security
- **Connection Security**: Encrypted database connections
- **Access Controls**: Role-based database access
- **Backup Security**: Encrypted backups with secure storage
- **Schema Protection**: Migration controls prevent unauthorized changes

## RAG Security

### Multi-Layer Security Model

#### Layer 1: Authentication & Authorization
- **API Key Validation**: Database-stored keys with project associations
- **Bearer Token Authentication**: Standard authorization headers
- **Project Binding**: Each API key tied to specific project UUID
- **No Authorization Bypass**: Removed fallback authentication methods

#### Layer 2: Project Isolation
- **Automatic Project Resolution**: Uses authenticated project UUID only
- **No User Override**: Prevents cross-project data access
- **Strict Binding**: Users can only access their own documents

#### Layer 3: Input Validation
- **Query Limits**: Maximum 1000 characters to prevent abuse
- **Content Filtering**: Blocks `<script>` tags and JavaScript URLs
- **Type Safety**: Zod schema validation with security constraints

#### Layer 4: Response Protection
- **Size Limits**: 10KB maximum response to prevent data exfiltration
- **Content Truncation**: Automatic truncation with security notices
- **Plain Text Only**: No JSON/HTML responses to prevent injection

#### Layer 5: Error Handling
- **Sanitized Messages**: Generic error responses prevent information disclosure
- **No Schema Exposure**: Validation errors don't reveal internal structure
- **Timeout Protection**: Reduced timeouts prevent DoS attacks

#### Layer 6: Audit & Monitoring
- **Comprehensive Logging**: All RAG queries logged with metadata
- **Security Monitoring**: Query patterns and user activity tracking
- **Incident Response**: Complete audit trail for security events

## Monitoring & Auditing

### Security Monitoring
- **Access Logging**: All authentication and authorization events
- **API Usage**: Request patterns and anomaly detection
- **Error Tracking**: Security-relevant errors and failures
- **Performance Monitoring**: Resource usage and DoS protection

### Audit Logs
- **User Actions**: Account changes, profile updates, sharing activities
- **Data Access**: Document queries, server configurations, collections
- **Administrative Actions**: Database migrations, system changes
- **Security Events**: Failed logins, rate limit violations, suspicious activity

### Incident Response
1. **Detection**: Automated monitoring and alerting
2. **Assessment**: Security team evaluation of threats
3. **Containment**: Immediate measures to limit impact
4. **Investigation**: Root cause analysis and evidence collection
5. **Recovery**: System restoration and security improvements
6. **Documentation**: Incident reports and lessons learned

## Security Best Practices

### For Developers

#### Code Security
- **Input Validation**: Use Zod schemas for all user inputs
- **Output Encoding**: Properly encode data before display
  ```typescript
  // ❌ WRONG - XSS vulnerability
  const html = `<p>${userInput}</p>`;
  
  // ✅ CORRECT - Properly escaped
  import { escapeHtml } from '@/lib/security-utils';
  const html = `<p>${escapeHtml(userInput)}</p>`;
  ```
- **SQL Injection Prevention**: Use parameterized queries only
- **XSS Prevention**: 
  - Never use template literals with user input in HTML
  - Use `encodeForJavaScript()` when passing data to `<script>` tags
  - Always escape HTML entities in user content
  - Add Content Security Policy headers to all HTML responses
- **CSRF Protection**: Implement anti-CSRF tokens

#### Authentication & Authorization
- **Verify Permissions**: Check user access for all operations
- **Session Management**: Proper session handling and timeout
- **Password Security**: Strong password requirements and hashing
- **Token Security**: Secure token generation and validation

#### Data Handling
- **Encryption**: Encrypt sensitive data at rest and in transit
- **Access Controls**: Implement least privilege access
- **Data Validation**: Validate all data before processing
- **Secure Deletion**: Proper data deletion and cleanup

### For Users

#### Account Security
- **Strong Passwords**: Use unique, complex passwords
- **Email Verification**: Keep email address current and verified
- **Regular Review**: Monitor account activity and settings
- **Secure Sharing**: Review sharing permissions regularly

#### Data Protection
- **Privacy Settings**: Configure appropriate privacy controls
- **Sensitive Data**: Avoid storing sensitive information in notes
- **Access Review**: Regularly review shared content and followers
- **Backup**: Maintain secure backups of important data

## Environment Security

### Required Environment Variables
```bash
# Authentication
NEXTAUTH_SECRET=your-secure-secret-key
NEXTAUTH_URL=https://your-domain.com

# Database
DATABASE_URL=postgresql://user:pass@host:port/db

# Admin Security
ADMIN_MIGRATION_SECRET=admin-migration-secret
ADMIN_NOTIFICATION_EMAILS=admin@example.com,security@example.com

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_REDIS_URL=redis://localhost:6379 # if using Redis
```

### Production Security Checklist
- [ ] HTTPS enabled with valid SSL certificates
- [ ] Secure environment variable storage
- [ ] Database connections encrypted
- [ ] File upload restrictions configured
- [ ] Rate limiting enabled
- [ ] Monitoring and alerting configured
- [ ] Backup and recovery procedures tested
- [ ] Security headers configured
- [ ] Content Security Policy implemented
- [ ] Regular security updates applied

### Recommended Security Headers
```nginx
# Nginx configuration example
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

## Supported Versions

| Version | Supported | Security Updates |
|---------|-----------|------------------|
| 1.0.x   | ✅ Yes    | ✅ Active        |
| 0.9.x   | ❌ No     | ❌ End of Life   |
| < 0.9   | ❌ No     | ❌ End of Life   |

### Update Policy
- **Security Patches**: Released as soon as possible for supported versions
- **Version Support**: Latest major version receives active security support
- **Deprecation Notice**: 90 days notice before ending support for versions

## Security Contact

### Primary Contacts
- **Security Team**: [security@plugged.in] (if available)
- **GitHub Security**: Use GitHub Security Advisories
- **Emergency**: Tag @security in issues for urgent matters

### Response Commitment
- **Acknowledgment**: Within 24 hours
- **Initial Response**: Within 72 hours
- **Regular Updates**: Weekly progress reports
- **Public Disclosure**: Coordinated with reporters

---

**Last Updated**: January 15, 2025 (Critical vulnerability fixes - XSS, SSRF, URL validation)  
**Next Review**: April 2025

For questions about this security policy, please contact our security team or create a GitHub issue. 
