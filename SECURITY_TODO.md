# SECURITY_TODO.md

## 🔴 Critical (Immediate - Day 1)

### Database Connection Security
- [ ] Update `db/index.ts` to add SSL configuration with `rejectUnauthorized: false`
- [ ] Add `DATABASE_SSL` environment variable to `.env.example`
- [ ] Test database connection with SSL enabled but no certificate validation
- [ ] Update all database connection documentation

### Remove Hardcoded Credentials
- [ ] Audit all `.env.example` files and remove actual passwords
- [ ] Replace example credentials with placeholders like `your-password-here`
- [ ] Search for hardcoded API keys in source files
- [ ] Add `.env` validation script to check required variables on startup

### Fix Deprecated Encryption
- [ ] Create `lib/encryption-v2.ts` with secure encryption using random salts
- [ ] Mark `deriveKeyLegacy` and `deriveKeyLegacyScrypt` as migration-only
- [ ] Write migration script to re-encrypt existing data
- [ ] Add `encryption_version` column to relevant tables
- [ ] Test encryption migration on development data

## 🟠 High Priority (Week 1)

### Database Schema Security
- [ ] Add PRIMARY KEY constraint to `password_reset_tokens` table
- [ ] Add `created_at`, `ip_address`, `user_agent` columns to password reset tokens
- [ ] Create index on `password_reset_tokens(expires)`
- [ ] Create index on `users(email, email_verified)`
- [ ] Create `audit_logs` table for security events
- [ ] Add index on `audit_logs(user_id, action, created_at)`

### Centralized Logging
- [ ] Install pino logger package
- [ ] Create `lib/logger.ts` with sensitive data redaction
- [ ] Replace all `console.log` statements with logger calls
- [ ] Set appropriate log levels (debug, info, warn, error)
- [ ] Configure log output format for production
- [ ] Add request ID tracking for API calls

### Authentication Enhancements
- [ ] Add failed login attempt tracking to auth flow
- [ ] Implement account lockout after 5 failed attempts
- [ ] Add password complexity validation (min 8 chars, mixed case, numbers)
- [ ] Add session timeout configuration
- [ ] Store last login timestamp and IP

### Clean Up Console Statements
- [ ] Remove console.log from production code in all components
- [ ] Replace debug console.logs with proper logger
- [ ] Add ESLint rule to prevent console.log in production

## 🟡 Medium Priority (Week 2-3)

### API Security
- [ ] Implement API key rotation mechanism
- [ ] Add API key expiration dates
- [ ] Create API key usage tracking
- [ ] Enhance rate limiting (move from in-memory to Redis when available)
- [ ] Add IP allowlisting for sensitive endpoints (server actions)

### Security Headers
- [ ] Add Content-Security-Policy headers
- [ ] Implement X-Frame-Options: DENY
- [ ] Add X-Content-Type-Options: nosniff
- [ ] Set Referrer-Policy
- [ ] Configure Permissions-Policy
- [ ] Add HSTS headers for production

### Input Validation
- [ ] Audit all Zod schemas for completeness
- [ ] Add SQL injection prevention checks
- [ ] Implement XSS sanitization for user inputs
- [ ] Add file upload type/size validation
- [ ] Create input validation middleware

### Row-Level Security
- [ ] Enable RLS on `mcp_servers` table
- [ ] Enable RLS on `profiles` table
- [ ] Enable RLS on `docs` table
- [ ] Create policies for user data isolation
- [ ] Test RLS policies with multiple users

## 🟢 Low Priority (Month 1-2)

### Monitoring & Compliance
- [ ] Set up error tracking (Sentry or similar)
- [ ] Create security metrics dashboard
- [ ] Implement automated security testing
- [ ] Add OWASP dependency scanning
- [ ] Create security documentation

### Session Management
- [ ] Implement session invalidation on password change
- [ ] Add concurrent session limiting
- [ ] Create session activity tracking
- [ ] Add "remember me" functionality securely

### Advanced Security Features
- [ ] Prepare MFA/2FA infrastructure
- [ ] Add email verification for sensitive operations
- [ ] Implement CAPTCHA for public forms
- [ ] Add security questions as backup auth
- [ ] Create security audit reports

## 📝 Documentation Tasks

- [ ] Create SECURITY.md with security best practices
- [ ] Document SSL configuration without certificates
- [ ] Write encryption migration guide
- [ ] Create incident response playbook
- [ ] Document all security-related environment variables

## 🧪 Testing Requirements

- [ ] Test SSL connections with self-signed certificates
- [ ] Verify encryption migration doesn't break existing data
- [ ] Test rate limiting under load
- [ ] Verify audit logging captures all events
- [ ] Test account lockout mechanism
- [ ] Validate all security headers are present

## 📊 Success Metrics

- [ ] Zero hardcoded credentials in codebase
- [ ] All database connections use SSL
- [ ] No deprecated encryption warnings
- [ ] Zero console.log statements in production
- [ ] Audit trail for all sensitive operations
- [ ] All user inputs validated with Zod
- [ ] Security headers score A+ on securityheaders.com
- [ ] Pass OWASP top 10 security checklist

## 🚫 Items Removed (No Admin Interface)

- ~~Admin-specific endpoints~~
- ~~Admin dashboard security~~
- ~~Admin role management~~
- ~~IP allowlisting for admin panel~~
- ~~Admin audit logs viewer~~

## 📅 Timeline Summary

- **Day 1**: Critical security fixes (SSL, credentials, encryption)
- **Week 1**: Database security, logging, basic auth improvements  
- **Week 2-3**: API security, headers, validation, RLS
- **Month 1-2**: Monitoring, advanced features, documentation

## 🔄 Implementation Progress

### ✅ Completed (Phase 1 - Critical)
- [x] Created SECURITY_TODO.md file
- [x] Database SSL configuration with self-signed certificate support (`db/index.ts`)
- [x] Environment variable updates - removed hardcoded credentials (`.env.example`)
- [x] Created new secure encryption module (`lib/encryption-v2.ts`)
- [x] Added database security migration (`drizzle/0053_security_enhancements.sql`)
- [x] Implemented centralized logging system with pino (`lib/logger.ts`)
- [x] Added security headers to middleware (CSP, HSTS, X-Frame-Options, etc.)

### 🚀 Ready for Testing
1. Run database migration: `pnpm db:migrate`
2. Test SSL connection with `DATABASE_SSL=true`
3. Verify logging with pino works correctly
4. Check security headers in browser developer tools

### 📋 Next Priority Tasks
1. Replace console.log statements throughout codebase with logger
2. Update authentication to track failed login attempts
3. Implement API key rotation mechanism
4. Add input validation enhancements
5. Enable Row-Level Security on database tables