# Security Documentation

## URL Validation and SSRF Prevention

This application implements comprehensive URL validation to prevent Server-Side Request Forgery (SSRF) attacks.

### Security Features

#### 1. Domain Allowlisting
- Only allows requests to explicitly trusted domains
- Prevents requests to arbitrary external services
- Configurable per environment

#### 2. IP Address Blocking
- Blocks all private IPv4 ranges (RFC 1918):
  - 10.0.0.0/8
  - 172.16.0.0/12
  - 192.168.0.0/16
  - 169.254.0.0/16 (link-local)
  - 127.0.0.0/8 (loopback)
- Blocks IPv6 private/local addresses:
  - ::1 (loopback)
  - fe80::/10 (link-local)
  - fc00::/7 (unique local)
  - ff00::/8 (multicast)

#### 3. Protocol Enforcement
- Only allows HTTP and HTTPS protocols
- Blocks file://, ftp://, javascript:, data: and other potentially dangerous protocols

#### 4. Credential Stripping
- Prevents URLs with embedded credentials (username:password@)
- Protects against credential leakage

#### 5. Special Character Protection
- Blocks null bytes in URLs
- Prevents directory traversal attempts

### Usage Guidelines

#### For External APIs
```typescript
import { validateExternalUrl } from '@/lib/url-validator';

// Validate before making request
const url = validateExternalUrl('https://api.github.com/repos/owner/repo');
const response = await fetch(url.toString());
```

#### For Internal Registry APIs
```typescript
import { validateInternalUrl } from '@/lib/url-validator';

// More restrictive validation for internal services
// Allows: registry.plugged.in, staging.plugged.in and their api subdomains
const url = validateInternalUrl('https://registry.plugged.in/v0/servers');
const response = await fetch(url.toString());
```

#### For Development with Localhost
```typescript
// Localhost is automatically allowed in development (NODE_ENV=development)
const url = validateExternalUrl('http://localhost:8000');

// Or explicitly enable localhost in any environment
const url = validateExternalUrl('http://localhost:8000', {
  allowLocalhost: true
});
```

### Security Assumptions

1. **Trust Boundary**: The allowed domains list defines our trust boundary. Only add domains that are:
   - Under our control (registry.plugged.in, staging.plugged.in)
   - Well-known, trusted third-party services (GitHub, npm, etc.)
   - Required for application functionality

2. **Environment-based Security**: 
   - Production: Strict domain allowlisting, no localhost
   - Development: Localhost automatically allowed for local testing
   - Staging: Staging domains are always allowed for testing

2. **Defense in Depth**: URL validation is one layer of defense. Additional layers include:
   - Rate limiting on API endpoints
   - Authentication and authorization checks
   - Input validation at multiple levels
   - Output encoding to prevent XSS

3. **Fail Secure**: When validation fails, the request is blocked. No fallback or bypass mechanisms.

### Testing

Comprehensive test coverage is provided in `tests/security/url-validator.test.ts`:
- SSRF prevention tests
- IPv4 and IPv6 validation
- Domain allowlisting
- Credential blocking
- Protocol validation
- Edge cases and attack vectors

Run security tests:
```bash
pnpm test tests/security/url-validator.test.ts
```

### Monitoring and Logging

Consider implementing:
1. **Security Telemetry**: Log blocked requests for security monitoring
2. **Rate Limiting**: Limit validation failures per IP to prevent abuse
3. **Alerting**: Alert on unusual patterns of blocked requests

### Updating Allowed Domains

To add a new allowed domain:
1. Review the domain's trustworthiness
2. Add to `ALLOWED_DOMAINS` in `lib/url-validator.ts`
3. For development-only domains, add to `DEV_ALLOWED_DOMAINS`
4. Document the reason for addition
5. Update tests to cover the new domain
6. Consider if it should be in `validateInternalUrl` allowed list

### Known Limitations

1. **DNS Rebinding**: URL validation happens before the request. DNS rebinding attacks that occur after validation are not prevented by this layer.
2. **Redirect Following**: The validator only checks the initial URL. Server-side redirects need additional handling.
3. **Time-of-Check vs Time-of-Use**: Domain resolution can change between validation and request execution.

### Incident Response

If a security issue is discovered:
1. Block the affected domain/IP immediately
2. Review logs for exploitation attempts
3. Update validation rules
4. Deploy fix with urgency
5. Document in security changelog

### Regular Security Reviews

- Review allowed domains quarterly
- Update blocked IP ranges as new private ranges are allocated
- Monitor for new SSRF techniques and update defenses
- Keep dependencies updated for security patches