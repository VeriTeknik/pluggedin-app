/**
 * CORS utilities for embedded chat security
 * Handles domain validation and CORS header management
 */

/**
 * Check if an origin is from plugged.in or allowed internal domains
 */
export function isPluggedInDomain(origin: string | null): boolean {
  if (!origin) return false;
  
  try {
    const url = new URL(origin);
    const hostname = url.hostname;
    
    // List of always-allowed internal domains
    const internalDomains = [
      'plugged.in',
      'www.plugged.in',
      'app.plugged.in',
      'registry.plugged.in',
      'localhost',
      '127.0.0.1',
    ];
    
    // Check exact matches
    if (internalDomains.includes(hostname)) {
      return true;
    }
    
    // Check for subdomains of plugged.in
    if (hostname.endsWith('.plugged.in')) {
      return true;
    }
    
    // Check for localhost with port 12005 (development)
    if ((hostname === 'localhost' || hostname === '127.0.0.1') && url.port === '12005') {
      return true;
    }
    
    return false;
  } catch {
    return false;
  }
}

/**
 * Check if an origin matches any of the allowed domain patterns
 */
export function isDomainAllowed(origin: string | null, allowedDomains: string[] | null): boolean {
  if (!origin) return false;
  
  // If no domains specified, allow all (backward compatibility)
  if (!allowedDomains || allowedDomains.length === 0) {
    return true;
  }
  
  // Always allow plugged.in domains
  if (isPluggedInDomain(origin)) {
    return true;
  }
  
  try {
    const originUrl = new URL(origin);
    const originHostname = originUrl.hostname;
    
    // Check each allowed domain pattern
    return allowedDomains.some(domain => {
      if (!domain || !domain.trim()) return false;
      
      const cleanDomain = domain.trim().toLowerCase();
      
      // Handle wildcard subdomains (*.example.com)
      if (cleanDomain.startsWith('*.')) {
        const baseDomain = cleanDomain.substring(2);
        return originHostname.endsWith(baseDomain) || originHostname === baseDomain;
      }
      
      // Handle exact domain match
      return originHostname === cleanDomain;
    });
  } catch {
    return false;
  }
}

/**
 * Set CORS headers on a response based on domain validation
 */
export function setCorsHeaders(
  response: Response,
  origin: string | null,
  allowedDomains: string[] | null
): void {
  if (!origin) return;
  
  if (isDomainAllowed(origin, allowedDomains)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  // If domain is not allowed, don't set any CORS headers
  // This will cause the browser to block the request
}

/**
 * Create an OPTIONS response with proper CORS headers
 */
export function createCorsOptionsResponse(
  origin: string | null,
  allowedDomains: string[] | null
): Response {
  const response = new Response(null, { status: 200 });
  
  if (origin && isDomainAllowed(origin, allowedDomains)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Access-Control-Max-Age', '86400'); // 24 hours
  }
  
  return response;
}

/**
 * Validate and normalize a domain for storage
 */
export function normalizeDomain(domain: string): string | null {
  if (!domain || !domain.trim()) return null;
  
  let normalized = domain.trim().toLowerCase();
  
  // Remove protocol if present
  normalized = normalized.replace(/^https?:\/\//, '');
  
  // Remove trailing slash
  normalized = normalized.replace(/\/$/, '');
  
  // Remove port for standard ports
  normalized = normalized.replace(/:80$/, '').replace(/:443$/, '');
  
  // Validate domain format (basic check)
  const domainRegex = /^(\*\.)?([a-z0-9-]+\.)*[a-z0-9-]+(:[0-9]+)?$/;
  if (!domainRegex.test(normalized)) {
    return null;
  }
  
  return normalized;
}