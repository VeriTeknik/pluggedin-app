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
 */
const ALLOWED_COMMANDS = [
  'node',
  'npx',
  'python',
  'python3',
  'uv',
  'uvx',
  'uvenv',
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
 * Validates a URL for MCP connections to prevent SSRF attacks
 */
export function validateMcpUrl(url: string): { valid: boolean; error?: string; parsedUrl?: URL } {
  try {
    const parsedUrl = new URL(url);
    
    // Check scheme
    if (!ALLOWED_SCHEMES.includes(parsedUrl.protocol as any)) {
      return {
        valid: false,
        error: `Invalid URL scheme: ${parsedUrl.protocol}. Only HTTP and HTTPS are allowed.`
      };
    }
    
    // Check for blocked hosts
    const hostname = parsedUrl.hostname.toLowerCase();
    
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
          error: `Blocked hostname pattern: ${hostname}. Private networks and localhost are not allowed.`
        };
      }
    }
    
    // Additional checks for IPv6
    if (hostname.includes(':')) {
      // Basic IPv6 localhost check
      if (hostname === '::1' || hostname.startsWith('fe80:') || hostname.startsWith('fc00:') || hostname.startsWith('fd00:')) {
        return {
          valid: false,
          error: `Blocked IPv6 address: ${hostname}. Private networks and localhost are not allowed.`
        };
      }
    }
    
    // Check port ranges (block common internal service ports)
    const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : (parsedUrl.protocol === 'https:' ? 443 : 80);
    if (port < 80 || (port > 65535)) {
      return {
        valid: false,
        error: `Invalid port: ${port}. Only ports 80-65535 are allowed.`
      };
    }
    
    // Block common internal service ports
    const blockedPorts = [22, 23, 25, 53, 110, 143, 993, 995, 1433, 1521, 3306, 5432, 6379, 27017];
    if (blockedPorts.includes(port)) {
      return {
        valid: false,
        error: `Blocked port: ${port}. This port is commonly used for internal services.`
      };
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