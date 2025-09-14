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

## Recent Security Enhancements (January 2025 - Admin Email System)

### 🔒 Critical Security Improvements Implemented

#### 1. Secure Unsubscribe Token System
- **Previous Issue**: Weak base64 encoding of email addresses allowing anyone to unsubscribe any user
- **Solution**: Cryptographically secure tokens with HMAC-SHA256 verification
- **Implementation**:
  - 48-hour token expiry
  - Timing-safe comparison to prevent timing attacks
  - Database tracking in `unsubscribe_tokens` table
  - Automatic cleanup of expired tokens

#### 2. Database-Backed Admin Roles
- **Previous Issue**: Admin access only via environment variables, no audit trail
- **Solution**: Database `is_admin` field with comprehensive audit logging
- **Management**: Use `scripts/set-admin-user.ts` for admin privilege management
```bash
# Grant or revoke admin privileges
npx tsx scripts/set-admin-user.ts
```

#### 3. Enhanced XSS Protection in Emails
- **Previous Issue**: Potential XSS via img tags and unsanitized content
- **Solution**: Strict HTML sanitization with whitelist approach
  - Removed all img tags (prevents tracking pixels)
  - Enforced CSP-compatible sanitization
  - Added security headers to all links (noopener noreferrer)

#### 4. Comprehensive Audit Logging
- **New Feature**: `admin_audit_log` table tracks all admin actions
- **Logged Data**:
  - Admin user ID and action performed
  - Target type and ID
  - IP address and user agent
  - Detailed metadata in JSONB format
  - Timestamp with timezone

#### 5. Rate Limiting for Admin Endpoints
- **Implementation**: Tiered rate limits to prevent abuse
  - General admin actions: 100 requests/minute
  - Email campaigns: 10/hour
  - Bulk operations: 5/hour
  - Sensitive actions (role changes): 20/hour

### 📋 Production Deployment Checklist

#### Step 1: Environment Configuration
```bash
# Generate secure token secret
export UNSUBSCRIBE_TOKEN_SECRET=$(openssl rand -hex 32)

# Add to production .env
echo "UNSUBSCRIBE_TOKEN_SECRET=$UNSUBSCRIBE_TOKEN_SECRET" >> .env
```

#### Step 2: Database Migration
```bash
# Apply security migration
pnpm db:migrate

# Verify new tables exist
psql $DATABASE_URL -c "\dt unsubscribe_tokens"
psql $DATABASE_URL -c "\dt admin_audit_log"
```

#### Step 3: Initial Admin Setup
```bash
# Set up admin users interactively
npx tsx scripts/set-admin-user.ts

# Verify admin users
psql $DATABASE_URL -c "SELECT email, is_admin, requires_2fa FROM users WHERE is_admin = true"
```

#### Step 4: Monitoring Setup
```sql
-- Create monitoring views
CREATE VIEW admin_activity_summary AS
SELECT
  DATE(created_at) as activity_date,
  admin_id,
  action,
  COUNT(*) as action_count
FROM admin_audit_log
GROUP BY DATE(created_at), admin_id, action
ORDER BY activity_date DESC;

-- Alert query for suspicious activity
CREATE VIEW suspicious_admin_activity AS
SELECT * FROM admin_audit_log
WHERE action IN ('send_bulk_email', 'update_user_role', 'delete_content')
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

#### Step 5: Automated Token Cleanup
```bash
# Add to crontab (runs daily at 3 AM)
0 3 * * * cd /path/to/app && node -e "require('./lib/unsubscribe-tokens').cleanupExpiredTokens()"
```

### 🔐 Security Monitoring Queries

```sql
-- Daily admin activity report
SELECT
  u.email,
  COUNT(*) as actions_today,
  array_agg(DISTINCT a.action) as action_types
FROM admin_audit_log a
JOIN users u ON a.admin_id = u.id
WHERE a.created_at > CURRENT_DATE
GROUP BY u.email;

-- Failed authentication attempts
SELECT
  ip_address,
  COUNT(*) as attempts,
  MAX(created_at) as last_attempt
FROM admin_audit_log
WHERE action = 'failed_login'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY ip_address
HAVING COUNT(*) > 3;

-- Email campaign monitoring
SELECT
  u.email as admin,
  a.details->>'recipientCount' as recipients,
  a.details->>'subject' as subject,
  a.created_at
FROM admin_audit_log a
JOIN users u ON a.admin_id = u.id
WHERE a.action = 'send_bulk_email'
ORDER BY a.created_at DESC
LIMIT 10;
```

### 🚨 Emergency Response Procedures

#### If Admin Account is Compromised
```sql
-- Step 1: Immediately disable compromised admin
UPDATE users SET is_admin = false
WHERE email = 'compromised@example.com';

-- Step 2: Review all actions by compromised account
SELECT * FROM admin_audit_log
WHERE admin_id = (SELECT id FROM users WHERE email = 'compromised@example.com')
ORDER BY created_at DESC;

-- Step 3: Invalidate all unsubscribe tokens if email system compromised
UPDATE unsubscribe_tokens
SET used_at = NOW()
WHERE used_at IS NULL;

-- Step 4: Reset all admin sessions
DELETE FROM sessions
WHERE user_id IN (SELECT id FROM users WHERE is_admin = true);
```

### 🔄 Ongoing Security Maintenance

#### Weekly Tasks
- Review admin audit logs for anomalies
- Check rate limit violations
- Verify admin user list is current
- Review failed authentication attempts

#### Monthly Tasks
- Rotate UNSUBSCRIBE_TOKEN_SECRET
- Review and update admin privileges
- Update security dependencies
- Analyze email campaign patterns

#### Quarterly Tasks
- Full security audit of admin functions
- Penetration testing of admin endpoints
- Review and update security documentation
- Conduct admin security training

### 🎯 Next Security Priorities

1. **Two-Factor Authentication (2FA)**
   - Database fields ready: `requires_2fa`, `two_fa_secret`, `two_fa_backup_codes`
   - Implement TOTP-based 2FA for all admin accounts
   - Mandatory 2FA for users with admin privileges

2. **Advanced Threat Detection**
   - Implement anomaly detection for admin actions
   - Set up real-time alerting for suspicious patterns
   - Create automated response for common threats

3. **Security Information and Event Management (SIEM)**
   - Centralize logging from all security components
   - Implement correlation rules for threat detection
   - Set up dashboard for security monitoring

---

**Last Updated**: January 15, 2025 (Critical vulnerability fixes - XSS, SSRF, URL validation, Admin Email Security)
**Security Improvements**: Secure tokens, admin roles, audit logging, rate limiting, XSS protection
**Next Review**: April 2025

For questions about this security policy or to report vulnerabilities, please contact our security team or create a GitHub Security Advisory. 
