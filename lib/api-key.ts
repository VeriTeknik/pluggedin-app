import crypto from 'crypto';

/**
 * Generate a secure API key for embedded chats
 * Format: ec_{32 bytes hex}
 * @returns A 66-character API key string
 */
export function generateEmbeddedChatApiKey(): string {
  const randomBytes = crypto.randomBytes(32);
  const hexString = randomBytes.toString('hex');
  return `ec_${hexString}`;
}

/**
 * Validate API key format
 * @param apiKey The API key to validate
 * @returns True if the API key has valid format
 */
export function isValidApiKeyFormat(apiKey: string): boolean {
  // Check if it starts with 'ec_' and has 64 hex characters after prefix
  const pattern = /^ec_[a-f0-9]{64}$/;
  return pattern.test(apiKey);
}

/**
 * Extract API key from various sources
 * @param req Request object
 * @returns API key or null
 */
export function extractApiKey(req: Request): string | null {
  // Check Authorization header
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Check X-API-Key header
  const apiKeyHeader = req.headers.get('x-api-key');
  if (apiKeyHeader) {
    return apiKeyHeader;
  }
  
  // Check query parameter
  const url = new URL(req.url);
  const queryApiKey = url.searchParams.get('api_key') || url.searchParams.get('key');
  if (queryApiKey) {
    return queryApiKey;
  }
  
  return null;
}