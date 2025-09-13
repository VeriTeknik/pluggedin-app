// Security validation utilities for MCP server configurations

/**
 * Allowed URL schemes for MCP connections
 */
const ALLOWED_SCHEMES = ['http:', 'https:'] as const;

/**
 * Blocked hosts to prevent SSRF attacks
 */
const BLOCKED_HOSTS = [
  // Localhost variations
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  // Private network ranges (basic patterns)
  '10.',
  '172.16.',
  '172.17.',
  '172.18.',
  '172.19.',
  '172.20.',
  '172.21.',
  '172.22.',
  '172.23.',
  '172.24.',
  '172.25.',
  '172.26.',
  '172.27.',
  '172.28.',
  '172.29.',
  '172.30.',
  '172.31.',
  '192.168.',
  // Link-local
  '169.254.',
  // Multicast
  '224.',
  '225.',
  '226.',
  '227.',
  '228.',
  '229.',
  '230.',
  '231.',
  '232.',
  '233.',
  '234.',
  '235.',
  '236.',
  '237.',
  '238.',
  '239.',
] as const;

/**
 * Allowed commands for STDIO MCP servers
 * SECURITY NOTE: Direct interpreter access increases attack surface.
 * Prefer package managers (npx, uvx) over direct interpreters when possible.
 */
const ALLOWED_COMMANDS = [
  // Package managers (recommended - sandboxed execution)
  'npx',      // Node.js package executor
  'pnpm',     // pnpm package manager (uses dlx for execution)
  'uvx',      // Python package executor (fast, secure)
  'dnx',      // .NET package executor
  'uv',       // Python package manager
  'uvenv',    // Python virtual environment tool
  // Direct interpreters (use with caution - less secure)
  'node',     // Direct Node.js execution
  'python',   // Direct Python execution
  'python3',  // Direct Python3 execution
] as const;

/**
 * Dangerous header names that should not be allowed
 */
const DANGEROUS_HEADERS = [
  'host',
  // 'authorization', // Allow for API authentication
  'cookie',
  'set-cookie',
  'x-forwarded-for',
  'x-real-ip',
  'x-forwarded-host',
  'x-forwarded-proto',
  'origin',
  'referer',
] as const;

/**
 * Check if an IP address is in a private range
 */
function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;
  
  // RFC 1918 private ranges
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  
  // Loopback
  if (parts[0] === 127) return true;
  
  // Link-local
  if (parts[0] === 169 && parts[1] === 254) return true;
  
  // Reserved
  if (parts[0] === 0) return true;
  
  return false;
}

/**
 * Validates a URL for MCP connections to prevent SSRF attacks
 * 
 * @param url - The URL to validate
 * @param options - Validation options
 * @param options.allowLocalhost - Allow localhost and private networks (requires explicit user consent)
 * @param options.userConsent - User has explicitly consented to localhost access
 * @returns Validation result with parsed URL if valid
 */
export function validateMcpUrl(
  url: string,
  options: { allowLocalhost?: boolean; userConsent?: boolean } = {}
): { valid: boolean; error?: string; parsedUrl?: URL } {
  try {
    const parsedUrl = new URL(url);
    
    // Check scheme
    if (!ALLOWED_SCHEMES.includes(parsedUrl.protocol as any)) {
      return {
        valid: false,
        error: `Invalid URL scheme: ${parsedUrl.protocol}. Only HTTP and HTTPS are allowed.`
      };
    }
    
    // NEVER auto-allow based on NODE_ENV - require explicit user consent
    const allowLocalhost = options.allowLocalhost && options.userConsent;
    
    // Skip host blocking if localhost is allowed with user consent
    if (!allowLocalhost) {
      const hostname = parsedUrl.hostname.toLowerCase();
      
      // Enhanced IP address validation
      // Check if hostname is an IP address
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
        if (isPrivateIP(hostname)) {
          return {
            valid: false,
            error: 'Private IP addresses are not allowed without explicit consent'
          };
        }
      }
      
      // Check exact matches
      if (BLOCKED_HOSTS.includes(hostname as any)) {
        return {
          valid: false,
          error: `Blocked hostname: ${hostname}. Private networks and localhost are not allowed.`
        };
      }
      
      // Check IP address patterns
      for (const blockedPattern of BLOCKED_HOSTS) {
        if (hostname.startsWith(blockedPattern)) {
          return {
            valid: false,
            error: `Blocked hostname pattern: ${hostname}. Private networks are not allowed.`
          };
        }
      }
      
      // Additional checks for IPv6
      if (hostname.includes(':')) {
        // Basic IPv6 localhost check
        if (hostname === '::1' || hostname.startsWith('fe80:') || hostname.startsWith('fc00:') || hostname.startsWith('fd00:')) {
          return {
            valid: false,
            error: `Blocked IPv6 address: ${hostname}. Private networks are not allowed.`
          };
        }
      }
      
      // Block common metadata endpoints (cloud providers)
      const blockedEndpoints = [
        '169.254.169.254', // AWS metadata
        'metadata.google.internal', // GCP metadata
        'metadata.azure.com', // Azure metadata
      ];
      
      if (blockedEndpoints.includes(hostname)) {
        return {
          valid: false,
          error: 'Cloud metadata endpoints are not allowed'
        };
      }
    }
    
    // Check port ranges (always validate ports for security)
    const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : (parsedUrl.protocol === 'https:' ? 443 : 80);
    
    // Allow wider port range in development
    const minPort = allowLocalhost ? 1 : 80;
    if (port < minPort || (port > 65535)) {
      return {
        valid: false,
        error: `Invalid port: ${port}. Only ports ${minPort}-65535 are allowed.`
      };
    }
    
    // Block common internal service ports (unless localhost is allowed)
    if (!allowLocalhost) {
      const blockedPorts = [22, 23, 25, 53, 110, 143, 993, 995, 1433, 1521, 3306, 5432, 6379, 27017];
      if (blockedPorts.includes(port)) {
        return {
          valid: false,
          error: `Blocked port: ${port}. This port is commonly used for internal services.`
        };
      }
    }
    
    return { valid: true, parsedUrl };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid URL format: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Validates custom headers to prevent header injection attacks
 */
export function validateHeaders(headers: Record<string, string>): { valid: boolean; error?: string; sanitizedHeaders?: Record<string, string> } {
  const sanitizedHeaders: Record<string, string> = {};
  
  for (const [name, value] of Object.entries(headers)) {
    const lowerName = name.toLowerCase();
    
    // Check for dangerous headers
    if (DANGEROUS_HEADERS.includes(lowerName as any)) {
      return {
        valid: false,
        error: `Dangerous header not allowed: ${name}`
      };
    }
    
    // Validate header name (RFC 7230)
    if (!/^[a-zA-Z0-9!#$&'*+\-.^_`|~]+$/.test(name)) {
      return {
        valid: false,
        error: `Invalid header name: ${name}. Header names must contain only valid characters.`
      };
    }
    
    // Validate header value (basic validation)
    if (typeof value !== 'string') {
      return {
        valid: false,
        error: `Invalid header value for ${name}: must be a string`
      };
    }
    
    // Check for control characters in header value
    if (/[\r\n\0]/.test(value)) {
      return {
        valid: false,
        error: `Invalid header value for ${name}: contains control characters`
      };
    }
    
    // Limit header value length
    if (value.length > 8192) {
      return {
        valid: false,
        error: `Header value too long for ${name}: maximum 8192 characters allowed`
      };
    }
    
    sanitizedHeaders[name] = value;
  }
  
  return { valid: true, sanitizedHeaders };
}

/**
 * Validates STDIO commands against an allowlist
 */
export function validateCommand(command: string): { valid: boolean; error?: string } {
  if (!command || typeof command !== 'string') {
    return {
      valid: false,
      error: 'Command must be a non-empty string'
    };
  }
  
  // Check against allowlist
  if (!ALLOWED_COMMANDS.includes(command as any)) {
    return {
      valid: false,
      error: `Command not allowed: ${command}. Allowed commands: ${ALLOWED_COMMANDS.join(', ')}`
    };
  }
  
  // Additional validation for command injection
  if (/[;&|`$(){}[\]<>]/.test(command)) {
    return {
      valid: false,
      error: `Command contains dangerous characters: ${command}`
    };
  }
  
  return { valid: true };
}

/**
 * Validates command arguments to prevent injection
 */
export function validateCommandArgs(args: string[]): { valid: boolean; error?: string; sanitizedArgs?: string[] } {
  if (!Array.isArray(args)) {
    return {
      valid: false,
      error: 'Arguments must be an array'
    };
  }
  
  const sanitizedArgs: string[] = [];
  
  for (const arg of args) {
    if (typeof arg !== 'string') {
      return {
        valid: false,
        error: 'All arguments must be strings'
      };
    }
    
    // Basic validation - no null bytes or extreme lengths
    if (arg.includes('\0')) {
      return {
        valid: false,
        error: 'Arguments cannot contain null bytes'
      };
    }
    
    if (arg.length > 4096) {
      return {
        valid: false,
        error: 'Argument too long: maximum 4096 characters allowed'
      };
    }
    
    sanitizedArgs.push(arg);
  }
  
  return { valid: true, sanitizedArgs };
} 