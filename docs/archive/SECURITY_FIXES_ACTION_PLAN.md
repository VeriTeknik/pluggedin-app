# Security Fixes Action Plan - StreamableHTTP Implementation

## Priority 0 - CRITICAL (Fix Immediately)

### 1. Add Authentication to Server Actions

**File:** `/app/actions/mcp-servers.ts`

Add this authentication helper at the top of the file:

```typescript
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

async function requireAuthentication(profileUuid: string): Promise<{ userId: string; hasAccess: boolean }> {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    throw new Error('Unauthorized: No active session');
  }
  
  // Verify user owns the profile
  const profile = await db.query.profilesTable.findFirst({
    where: eq(profilesTable.uuid, profileUuid),
    with: {
      project: {
        columns: {
          user_id: true
        }
      }
    }
  });
  
  if (!profile || profile.project.user_id !== session.user.id) {
    throw new Error('Forbidden: Access denied to this profile');
  }
  
  return { userId: session.user.id, hasAccess: true };
}
```

Then update each function:

```typescript
export async function updateMcpServer(
  profileUuid: string,
  uuid: string,
  data: {...}
): Promise<{ success: boolean; error?: string }> {
  try {
    // ADD THIS LINE
    await requireAuthentication(profileUuid);
    
    // ... rest of the function
  } catch (error) {
    // Handle authentication errors
    if (error.message.includes('Unauthorized') || error.message.includes('Forbidden')) {
      return { success: false, error: error.message };
    }
    // ... existing error handling
  }
}
```

### 2. Remove Hardcoded Encryption Key

**Step 1:** Generate new encryption key:
```bash
openssl rand -base64 32
```

**Step 2:** Update `.env.example`:
```env
# SECURITY: Generate with: openssl rand -base64 32
# NEVER commit the actual key to version control
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=
```

**Step 3:** Add to `.gitignore`:
```gitignore
# Security - Never commit encryption keys
.env
.env.local
.env.production
```

**Step 4:** Create migration script for re-encryption:
```typescript
// scripts/rotate-encryption-key.ts
import { db } from '@/db';
import { mcpServersTable } from '@/db/schema';
import { decryptField, encryptField } from '@/lib/encryption';

async function rotateEncryptionKeys() {
  const oldKey = process.env.OLD_ENCRYPTION_KEY;
  const newKey = process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY;
  
  if (!oldKey || !newKey) {
    throw new Error('Both OLD_ENCRYPTION_KEY and new key must be set');
  }
  
  // Get all servers with encrypted data
  const servers = await db.select().from(mcpServersTable);
  
  for (const server of servers) {
    // Decrypt with old key
    process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = oldKey;
    const decrypted = decryptServerData(server);
    
    // Encrypt with new key
    process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = newKey;
    const reEncrypted = encryptServerData(decrypted);
    
    // Update database
    await db.update(mcpServersTable)
      .set(reEncrypted)
      .where(eq(mcpServersTable.uuid, server.uuid));
  }
  
  console.log(`Rotated encryption for ${servers.length} servers`);
}
```

## Priority 1 - HIGH (Within 24 hours)

### 3. Implement Rate Limiting

**File:** `/app/actions/mcp-servers.ts`

Add rate limiting wrapper:

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'), // 10 requests per minute
  analytics: true,
});

async function rateLimitCheck(userId: string, action: string) {
  const identifier = `${userId}:${action}`;
  const { success, limit, reset, remaining } = await ratelimit.limit(identifier);
  
  if (!success) {
    throw new Error(`Rate limit exceeded. Try again in ${Math.floor((reset - Date.now()) / 1000)} seconds`);
  }
  
  return { remaining, reset };
}

// Use in functions:
export async function updateMcpServer(...) {
  try {
    const { userId } = await requireAuthentication(profileUuid);
    await rateLimitCheck(userId, 'update-server');
    // ... rest of function
  }
}
```

### 4. Strengthen SSRF Protection

**File:** `/lib/security/validators.ts`

Update the validation logic:

```typescript
export function validateMcpUrl(
  url: string,
  options: { allowLocalhost?: boolean; userConsent?: boolean } = {}
): { valid: boolean; error?: string; parsedUrl?: URL } {
  try {
    const parsedUrl = new URL(url);
    
    // NEVER auto-allow based on NODE_ENV
    const allowLocalhost = options.allowLocalhost && options.userConsent;
    
    if (!allowLocalhost) {
      // Enhanced IP validation
      const hostname = parsedUrl.hostname;
      
      // Check for IP addresses
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
        const parts = hostname.split('.').map(Number);
        
        // RFC 1918 private ranges
        if (
          parts[0] === 10 ||
          (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
          (parts[0] === 192 && parts[1] === 168) ||
          parts[0] === 127 ||
          parts[0] === 0
        ) {
          return {
            valid: false,
            error: 'Private IP addresses are not allowed'
          };
        }
      }
      
      // DNS rebinding protection
      // Store and validate resolved IPs
      try {
        const { resolve4 } = require('dns').promises;
        const ips = await resolve4(hostname);
        
        for (const ip of ips) {
          // Re-validate resolved IPs
          if (isPrivateIP(ip)) {
            return {
              valid: false,
              error: 'Domain resolves to private IP address'
            };
          }
        }
      } catch (e) {
        // DNS resolution failed - suspicious
        return {
          valid: false,
          error: 'Unable to resolve domain'
        };
      }
    }
    
    return { valid: true, parsedUrl };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid URL: ${error.message}`
    };
  }
}
```

### 5. Validate Authorization Headers

**File:** `/lib/security/validators.ts`

Add specific validation for Authorization headers:

```typescript
export function validateHeaders(headers: Record<string, string>): { 
  valid: boolean; 
  error?: string; 
  sanitizedHeaders?: Record<string, string> 
} {
  const sanitizedHeaders: Record<string, string> = {};
  
  for (const [name, value] of Object.entries(headers)) {
    const lowerName = name.toLowerCase();
    
    // Special handling for Authorization header
    if (lowerName === 'authorization') {
      // Only allow Bearer tokens with proper format
      if (!value.match(/^Bearer [A-Za-z0-9\-._~+\/]+=*$/)) {
        return {
          valid: false,
          error: 'Invalid Authorization header format. Only Bearer tokens are allowed.'
        };
      }
      
      // Validate token length
      const token = value.replace('Bearer ', '');
      if (token.length < 20 || token.length > 2048) {
        return {
          valid: false,
          error: 'Invalid token length'
        };
      }
      
      // Could add JWT structure validation here if needed
      sanitizedHeaders[name] = value;
      continue;
    }
    
    // Block other dangerous headers
    if (DANGEROUS_HEADERS.includes(lowerName as any)) {
      return {
        valid: false,
        error: `Header not allowed: ${name}`
      };
    }
    
    // ... rest of existing validation
    sanitizedHeaders[name] = value;
  }
  
  // Limit total number of headers
  if (Object.keys(sanitizedHeaders).length > 20) {
    return {
      valid: false,
      error: 'Too many headers. Maximum 20 headers allowed.'
    };
  }
  
  return { valid: true, sanitizedHeaders };
}
```

## Priority 2 - MEDIUM (Within 1 week)

### 6. Add Input Length Validation

**File:** `/lib/validation/mcp-server-schemas.ts`

Update schemas with length limits:

```typescript
export const streamableHttpServerSchema = baseServerSchema.extend({
  type: z.literal(McpServerType.STREAMABLE_HTTP),
  server_url: z.string().url('Invalid server URL').max(2048),
  headers: z.record(z.string().max(1024)).optional()
    .refine(
      (headers) => !headers || Object.keys(headers).length <= 20,
      'Maximum 20 headers allowed'
    )
    .refine(
      (headers) => !headers || JSON.stringify(headers).length <= 8192,
      'Headers too large. Maximum 8KB allowed.'
    ),
  sessionId: z.string().max(256).optional(),
});
```

### 7. Improve Error Handling

**File:** `/lib/encryption.ts`

Replace console.error with secure logging:

```typescript
import { logger } from '@/lib/logger'; // Create a secure logger

export function decryptServerData<T>(server: T): T {
  const decrypted: any = { ...server };
  
  if (server.command_encrypted) {
    try {
      decrypted.command = decryptField(server.command_encrypted);
    } catch (error) {
      // Log to secure service, not console
      logger.error('Decryption failed', {
        field: 'command',
        serverUuid: server.uuid,
        // Don't log the actual error details
      });
      decrypted.command = null;
    }
    delete decrypted.command_encrypted;
  }
  
  // ... rest of function
}
```

### 8. Add Audit Logging

Create a new audit logging system:

```typescript
// lib/audit-logger.ts
import { db } from '@/db';
import { auditLogsTable } from '@/db/schema';

export async function auditLog({
  userId,
  action,
  resourceType,
  resourceId,
  changes,
  ipAddress,
  userAgent,
}: {
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  changes?: any;
  ipAddress?: string;
  userAgent?: string;
}) {
  await db.insert(auditLogsTable).values({
    user_id: userId,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    changes: changes ? JSON.stringify(changes) : null,
    ip_address: ipAddress,
    user_agent: userAgent,
    created_at: new Date(),
  });
}

// Use in server actions:
await auditLog({
  userId: session.user.id,
  action: 'UPDATE_MCP_SERVER',
  resourceType: 'mcp_server',
  resourceId: uuid,
  changes: data,
  ipAddress: request.headers.get('x-forwarded-for'),
  userAgent: request.headers.get('user-agent'),
});
```

## Testing Checklist

- [ ] Test authentication bypass attempts
- [ ] Test with rotated encryption keys
- [ ] Test rate limiting with rapid requests
- [ ] Test SSRF with various private IPs
- [ ] Test header injection attempts
- [ ] Test with oversized payloads
- [ ] Verify audit logs are created
- [ ] Test error messages don't leak info
- [ ] Test CSRF protection
- [ ] Load test encryption operations

## Deployment Checklist

1. [ ] Generate new encryption key
2. [ ] Update production secrets (not in repo)
3. [ ] Run key rotation script
4. [ ] Deploy authentication fixes
5. [ ] Enable rate limiting
6. [ ] Configure audit logging
7. [ ] Update security headers
8. [ ] Monitor for anomalies
9. [ ] Schedule penetration test
10. [ ] Document security procedures

## Monitoring Requirements

Set up alerts for:
- Failed authentication attempts > 5 per minute
- Rate limit violations
- Decryption failures
- SSRF attempt patterns
- Unusual header patterns
- Large payload attempts

## Communication Plan

1. **Internal Team:**
   - Immediate notification of critical fixes needed
   - Daily updates on progress
   - Security training scheduled

2. **Users (if affected):**
   - Notification of security update
   - Required action (if any)
   - Timeline for changes

3. **Security Team:**
   - Request penetration testing
   - Schedule re-audit after fixes
   - Establish ongoing security reviews