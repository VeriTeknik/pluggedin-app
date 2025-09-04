/**
 * Enhanced security-focused validation schemas using Zod
 * Prevents injection attacks and validates all user inputs
 */

import sanitizeHtmlLib from 'sanitize-html';
import { z } from 'zod';

// Constants for validation
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const MAX_EMAIL_LENGTH = 255;
const MAX_NAME_LENGTH = 100;
const MAX_TEXT_INPUT_LENGTH = 1000;
const MAX_URL_LENGTH = 2048;

/**
 * SQL Injection prevention - detect common SQL patterns
 */
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|CREATE|ALTER|EXEC|EXECUTE)\b)/i,
  /(--|;|\/\*|\*\/|xp_|sp_|0x)/,
  /(\bOR\b\s*\d+\s*=\s*\d+)/i,
  /(\bAND\b\s*\d+\s*=\s*\d+)/i,
  /'.*\bOR\b.*'/i,
];

/**
 * XSS prevention - detect common XSS patterns
 */
const XSS_PATTERNS = [
  /<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi,  // Fixed: properly matches script tags
  /<iframe\b[^>]*>[\s\S]*?<\/iframe\b[^>]*>/gi,  // Fixed: properly matches iframe tags
  /javascript:/gi,
  /data:/gi,  // Added: data URIs can be dangerous
  /vbscript:/gi,  // Added: vbscript URIs
  /on\w+\s*=/gi, // onclick=, onload=, etc.
  /<embed[^>]*>/gi,
  /<object[^>]*>/gi,
  /data:text\/html/gi,
];

/**
 * Path traversal prevention
 */
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//g,
  /\.\.\\/, 
  /%2e%2e/gi,
  /\.\.%2f/gi,
];

/**
 * Custom Zod refinements for security
 */
const noSqlInjection = (value: string) => {
  return !SQL_INJECTION_PATTERNS.some(pattern => pattern.test(value));
};

const noXss = (value: string) => {
  return !XSS_PATTERNS.some(pattern => pattern.test(value));
};

const noPathTraversal = (value: string) => {
  return !PATH_TRAVERSAL_PATTERNS.some(pattern => pattern.test(value));
};

/**
 * Email validation with security checks
 */
export const secureEmailSchema = z
  .string()
  .min(1, 'Email is required')
  .max(MAX_EMAIL_LENGTH, `Email must be less than ${MAX_EMAIL_LENGTH} characters`)
  .email('Invalid email format')
  .toLowerCase()
  .trim()
  .refine(noSqlInjection, 'Invalid characters detected in email')
  .refine(noXss, 'Invalid characters detected in email')
  .refine((email) => {
    // Additional email security checks
    const parts = email.split('@');
    if (parts.length !== 2) return false;
    
    const [_localPart, domain] = parts;
    
    // Check for valid domain
    if (!domain.includes('.')) return false;
    
    // Prevent email addresses that might be used for attacks
    const suspiciousPatterns = [
      /^admin@/i,
      /^root@/i,
      /^postmaster@/i,
      /^test@/i,
    ];
    
    return !suspiciousPatterns.some(pattern => pattern.test(email));
  }, 'Email address not allowed');

/**
 * Password validation with complexity requirements
 */
export const securePasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(MAX_PASSWORD_LENGTH, `Password must be less than ${MAX_PASSWORD_LENGTH} characters`)
  .refine((password) => /[a-z]/.test(password), 'Password must contain at least one lowercase letter')
  .refine((password) => /[A-Z]/.test(password), 'Password must contain at least one uppercase letter')
  .refine((password) => /[0-9]/.test(password), 'Password must contain at least one number')
  .refine((password) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password), 'Password must contain at least one special character')
  .refine((password) => {
    // Check for common weak passwords
    const commonPasswords = [
      'password123',
      'admin123',
      'qwerty123',
      '12345678',
      'letmein123',
      'welcome123',
    ];
    return !commonPasswords.includes(password.toLowerCase());
  }, 'Password is too common');

/**
 * Username validation
 */
export const secureUsernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be less than 30 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens')
  .refine(noSqlInjection, 'Invalid characters in username')
  .refine((username) => {
    // Prevent reserved usernames
    const reserved = ['admin', 'root', 'system', 'api', 'null', 'undefined'];
    return !reserved.includes(username.toLowerCase());
  }, 'Username is reserved');

/**
 * General text input validation
 */
export const secureTextInputSchema = z
  .string()
  .max(MAX_TEXT_INPUT_LENGTH, `Input must be less than ${MAX_TEXT_INPUT_LENGTH} characters`)
  .refine(noSqlInjection, 'Invalid characters detected')
  .refine(noXss, 'Invalid HTML/script content detected')
  .transform((val) => val.trim());

/**
 * URL validation
 */
export const secureUrlSchema = z
  .string()
  .max(MAX_URL_LENGTH, `URL must be less than ${MAX_URL_LENGTH} characters`)
  .url('Invalid URL format')
  .refine((url) => {
    try {
      const urlObj = new URL(url);
      // Only allow http and https protocols
      return ['http:', 'https:'].includes(urlObj.protocol);
    } catch {
      return false;
    }
  }, 'Invalid URL protocol')
  .refine(noXss, 'Invalid content in URL')
  .refine((url) => {
    // Prevent SSRF attacks - block local/internal addresses
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      const blockedHosts = [
        'localhost',
        '127.0.0.1',
        '0.0.0.0',
        '::1',
        '169.254.169.254', // AWS metadata endpoint
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^192\.168\./,
      ];
      
      return !blockedHosts.some(blocked => 
        typeof blocked === 'string' 
          ? hostname === blocked 
          : blocked.test(hostname)
      );
    } catch {
      return false;
    }
  }, 'URL points to restricted address');

/**
 * File upload validation
 */
export const secureFileUploadSchema = z.object({
  name: z.string()
    .max(255, 'Filename too long')
    .refine(noPathTraversal, 'Invalid filename')
    .refine((name) => {
      // Check for allowed extensions
      const allowedExtensions = [
        '.jpg', '.jpeg', '.png', '.gif', '.webp', // Images
        '.pdf', '.doc', '.docx', '.txt', // Documents
        '.json', '.csv', '.xml', // Data files
      ];
      
      const ext = name.substring(name.lastIndexOf('.')).toLowerCase();
      return allowedExtensions.includes(ext);
    }, 'File type not allowed'),
  
  size: z.number()
    .max(10 * 1024 * 1024, 'File size must be less than 10MB'),
  
  type: z.string()
    .refine((type) => {
      // Whitelist of allowed MIME types
      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
        'text/plain',
        'application/json',
        'text/csv',
      ];
      return allowedTypes.includes(type);
    }, 'File type not allowed'),
});

/**
 * API key validation
 */
export const secureApiKeySchema = z
  .string()
  .regex(/^pg_in_[a-f0-9]{64}$/, 'Invalid API key format')
  .refine(noSqlInjection, 'Invalid API key');

/**
 * Database ID validation (UUID)
 */
export const secureDatabaseIdSchema = z
  .string()
  .uuid('Invalid ID format');

/**
 * Login form validation
 */
export const secureLoginSchema = z.object({
  email: secureEmailSchema,
  password: z.string().min(1, 'Password is required'),
});

/**
 * Registration form validation
 */
export const secureRegistrationSchema = z.object({
  email: secureEmailSchema,
  password: securePasswordSchema,
  passwordConfirm: z.string(),
  name: z.string()
    .min(1, 'Name is required')
    .max(MAX_NAME_LENGTH, `Name must be less than ${MAX_NAME_LENGTH} characters`)
    .refine(noSqlInjection, 'Invalid characters in name')
    .refine(noXss, 'Invalid characters in name'),
}).refine((data) => data.password === data.passwordConfirm, {
  message: 'Passwords do not match',
  path: ['passwordConfirm'],
});

/**
 * MCP Server configuration validation
 */
export const secureMcpServerSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters')
    .refine(noSqlInjection, 'Invalid characters in name')
    .refine(noXss, 'Invalid characters in name'),
  
  type: z.enum(['STDIO', 'SSE', 'STREAMABLE_HTTP']),
  
  config: z.string()
    .max(5000, 'Configuration too long')
    .refine(noSqlInjection, 'Invalid configuration')
    .refine(noXss, 'Invalid configuration'),
  
  notes: z.string()
    .max(1000, 'Notes too long')
    .optional()
    .refine((val) => !val || noSqlInjection(val), 'Invalid characters in notes')
    .refine((val) => !val || noXss(val), 'Invalid characters in notes'),
});

/**
 * Search query validation
 */
export const secureSearchSchema = z
  .string()
  .max(200, 'Search query too long')
  .refine(noSqlInjection, 'Invalid search query')
  .refine(noXss, 'Invalid search query')
  .transform((val) => val.trim());

/**
 * Pagination validation
 */
export const securePaginationSchema = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1, 'Page must be at least 1')
    .max(10000, 'Page number too large')
    .default(1),
  
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit must be at most 100')
    .default(10),
  
  sort: z.enum(['asc', 'desc', 'created_at', 'updated_at', 'name'])
    .optional()
    .default('desc'),
});

/**
 * JSON validation
 */
export const secureJsonSchema = z.string()
  .refine((val) => {
    try {
      JSON.parse(val);
      return true;
    } catch {
      return false;
    }
  }, 'Invalid JSON format')
  .refine(noSqlInjection, 'Invalid content in JSON')
  .refine(noXss, 'Invalid content in JSON');

/**
 * Sanitize HTML content (for rich text editors)
 * Uses sanitize-html library for robust XSS prevention
 */
export function sanitizeHtml(html: string): string {
  // Use sanitize-html library for robust sanitization
  return sanitizeHtmlLib(html, {
    allowedTags: [
      // Text formatting
      'b', 'i', 'em', 'strong', 'u', 's', 'strike', 'del', 'ins', 'mark',
      // Structural elements
      'p', 'br', 'hr', 'div', 'span',
      // Lists
      'ul', 'ol', 'li',
      // Links (with safe attributes)
      'a',
      // Headings
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      // Quotes and code
      'blockquote', 'q', 'code', 'pre', 'kbd', 'samp',
      // Tables
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
      // Other safe elements
      'abbr', 'cite', 'dfn', 'sub', 'sup', 'time', 'var',
    ],
    allowedAttributes: {
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
      blockquote: ['cite'],
      q: ['cite'],
      time: ['datetime'],
      // Allow class for styling, but not id (to prevent DOM clobbering)
      '*': ['class'],
    },
    // Only allow safe URL schemes
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      a: ['http', 'https', 'mailto'],
      img: ['http', 'https', 'data'], // data URLs for images only
      blockquote: ['http', 'https'],
      q: ['http', 'https'],
    },
    allowedSchemesAppliedToAttributes: ['href', 'src', 'cite'],
    // Ensure links open in new tab with proper security
    transformTags: {
      'a': sanitizeHtmlLib.simpleTransform('a', { 
        rel: 'noopener noreferrer nofollow',
        target: '_blank' 
      })
    },
    // Don't allow any styles (inline CSS can be dangerous)
    allowedStyles: {},
    // Discard entire tags if they're not allowed (vs keeping their contents)
    disallowedTagsMode: 'discard',
  });
}

/**
 * Rate limit validation for API endpoints
 */
export const secureRateLimitSchema = z.object({
  ip: z.string().ip(),
  endpoint: z.string().max(255),
  timestamp: z.date(),
  count: z.number().int().min(0),
});

// Export all schemas and utilities
const securitySchemas = {
  // Basic validators
  email: secureEmailSchema,
  password: securePasswordSchema,
  username: secureUsernameSchema,
  text: secureTextInputSchema,
  url: secureUrlSchema,
  apiKey: secureApiKeySchema,
  id: secureDatabaseIdSchema,
  
  // Form validators
  login: secureLoginSchema,
  registration: secureRegistrationSchema,
  
  // Feature validators
  mcpServer: secureMcpServerSchema,
  fileUpload: secureFileUploadSchema,
  search: secureSearchSchema,
  pagination: securePaginationSchema,
  json: secureJsonSchema,
  rateLimit: secureRateLimitSchema,
  
  // Utilities
  sanitizeHtml,
  
  // Constants
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_TEXT_INPUT_LENGTH,
  MAX_URL_LENGTH,
};

export default securitySchemas;