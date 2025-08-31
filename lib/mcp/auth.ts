import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { db } from '@/db';
import { apiKeysTable, profilesTable, projectsTable } from '@/db/schema';
import { authOptions } from '@/lib/auth';
import { oauthProvider } from '@/lib/oauth/provider';

/**
 * MCP Authentication and Authorization system
 * Handles API key authentication and OAuth support
 */
export class MCPAuth {
  private static instance: MCPAuth;

  private constructor() {}

  static getInstance(): MCPAuth {
    if (!MCPAuth.instance) {
      MCPAuth.instance = new MCPAuth();
    }
    return MCPAuth.instance;
  }

  /**
   * Authenticate a request using session, API key, or OAuth token
   * @param request - The incoming NextRequest
   * @param expectedResource - Optional resource/audience URL for OAuth token validation (RFC 8707)
   */
  async authenticateRequest(
    request: NextRequest,
    expectedResource?: string
  ): Promise<{
    success: boolean;
    profileUuid?: string;
    error?: NextResponse;
    authMethod?: 'session' | 'api_key' | 'oauth';
  }> {
    try {
      // Try NextAuth session authentication first (for logged-in users)
      const sessionResult = await this.authenticateWithSession();
      if (sessionResult.success && sessionResult.profileUuid) {
        return {
          ...sessionResult,
          authMethod: 'session'
        };
      }

      // Try Bearer token authentication (could be API key or OAuth token)
      const authHeader = request.headers.get('authorization');
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        
        // Check if it's an OAuth token (starts with 'plg_access_')
        if (token.startsWith('plg_access_')) {
          const oauthResult = await this.authenticateWithOAuth(token, expectedResource);
          if (oauthResult.success) {
            return {
              ...oauthResult,
              authMethod: 'oauth'
            };
          }
        } else {
          // Try as API key
          const apiKeyResult = await this.authenticateWithApiKey(token);
          if (apiKeyResult.success) {
            return {
              ...apiKeyResult,
              authMethod: 'api_key'
            };
          }
        }
      }

      // Also check X-OAuth-Token header for backward compatibility
      const oauthToken = request.headers.get('x-oauth-token');
      if (oauthToken) {
        const oauthResult = await this.authenticateWithOAuth(oauthToken, expectedResource);
        if (oauthResult.success) {
          return {
            ...oauthResult,
            authMethod: 'oauth'
          };
        }
      }

      // No authentication provided or all methods failed
      return {
        success: false,
        error: this.createAuthError('Authentication required. Please provide a valid session, API key, or OAuth token.', 'unauthorized')
      };
    } catch (error) {
      return {
        success: false,
        error: this.createAuthError('Authentication failed')
      };
    }
  }

  /**
   * Authenticate using NextAuth session
   */
  private async authenticateWithSession(): Promise<{
    success: boolean;
    profileUuid?: string;
    error?: NextResponse;
  }> {
    try {
      const session = await getServerSession(authOptions);
      
      if (!session?.user?.id) {
        return {
          success: false,
          error: this.createAuthError('No active session', 'unauthorized')
        };
      }

      // Get the user's active profile
      const result = await db
        .select({
          profileUuid: profilesTable.uuid
        })
        .from(projectsTable)
        .leftJoin(profilesTable, eq(projectsTable.active_profile_uuid, profilesTable.uuid))
        .where(eq(projectsTable.user_id, session.user.id))
        .limit(1);

      if (result.length === 0 || !result[0].profileUuid) {
        return {
          success: false,
          error: this.createAuthError('No active profile found', 'forbidden')
        };
      }

      return {
        success: true,
        profileUuid: result[0].profileUuid
      };
    } catch (error) {
      console.error('Session authentication error:', error);
      return {
        success: false,
        error: this.createAuthError('Session authentication failed')
      };
    }
  }

  /**
   * Authenticate using API key
   */
  private async authenticateWithApiKey(apiKey: string): Promise<{
    success: boolean;
    profileUuid?: string;
    error?: NextResponse;
  }> {
    try {
      // Query the database for the API key
      const result = await db
        .select({
          profileUuid: profilesTable.uuid,
          apiKey: apiKeysTable.api_key
        })
        .from(apiKeysTable)
        .leftJoin(profilesTable, eq(apiKeysTable.project_uuid, profilesTable.project_uuid))
        .where(eq(apiKeysTable.api_key, apiKey))
        .limit(1);

      if (result.length === 0) {
        return {
          success: false,
          error: this.createAuthError('Invalid API key', 'forbidden')
        };
      }

      const { profileUuid } = result[0];
      
      if (!profileUuid) {
        return {
          success: false,
          error: this.createAuthError('Profile not found', 'forbidden')
        };
      }
      
      return {
        success: true,
        profileUuid
      };
    } catch (error) {
      return {
        success: false,
        error: this.createAuthError('API key authentication failed')
      };
    }
  }

  /**
   * Authenticate using OAuth token
   */
  private async authenticateWithOAuth(token: string, expectedResource?: string): Promise<{
    success: boolean;
    profileUuid?: string;
    error?: NextResponse;
  }> {
    try {
      // Validate the OAuth access token
      const validation = await oauthProvider.validateAccessToken(token);
      
      if (!validation.valid) {
        return {
          success: false,
          error: this.createAuthError(validation.error || 'Invalid OAuth token', 'forbidden')
        };
      }
      
      // Validate resource/audience if specified (RFC 8707)
      if (expectedResource && validation.resource) {
        // Normalize URLs for comparison
        const normalizedExpected = this.normalizeResourceUrl(expectedResource);
        const normalizedActual = this.normalizeResourceUrl(validation.resource);
        
        if (normalizedExpected !== normalizedActual) {
          console.error('OAuth token resource mismatch:', {
            expected: normalizedExpected,
            actual: normalizedActual
          });
          return {
            success: false,
            error: this.createAuthError('Token not authorized for this resource', 'forbidden')
          };
        }
      }
      
      return {
        success: true,
        profileUuid: validation.profileUuid
      };
    } catch (error) {
      console.error('OAuth authentication error:', error);
      return {
        success: false,
        error: this.createAuthError('OAuth authentication failed')
      };
    }
  }

  /**
   * Normalize resource URL for comparison (RFC 8707)
   * Removes trailing slashes and normalizes protocols
   */
  private normalizeResourceUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Normalize protocol (http/https are considered equivalent for resource matching)
      const protocol = parsed.protocol.replace(':', '');
      const normalizedProtocol = protocol === 'http' ? 'https' : protocol;
      
      // Remove trailing slashes from pathname
      const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
      
      // Rebuild normalized URL
      return `${normalizedProtocol}://${parsed.host}${pathname}${parsed.search}${parsed.hash}`;
    } catch {
      // If not a valid URL, return as-is for string comparison
      return url.toLowerCase().replace(/\/+$/, '');
    }
  }

  /**
   * Create authentication error response with proper JSON-RPC error codes
   * According to MCP spec:
   * - 401: Authentication required (no credentials provided)
   * - 403: Forbidden (invalid credentials or insufficient permissions)
   * - 400: Bad request (malformed authentication)
   */
  private createAuthError(message: string, type: 'unauthorized' | 'forbidden' | 'bad_request' = 'forbidden'): NextResponse {
    let status: number;
    let code: number;
    let errorMessage: string;
    
    switch (type) {
      case 'unauthorized':
        status = 401;
        code = -32001; // Custom code for authentication required
        errorMessage = 'Authentication required';
        break;
      case 'bad_request':
        status = 400;
        code = -32600; // Invalid Request per JSON-RPC spec
        errorMessage = 'Invalid authentication request';
        break;
      case 'forbidden':
      default:
        status = 403;
        code = -32000; // Server error - forbidden
        errorMessage = 'Authentication failed';
        break;
    }
    
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: {
          code,
          message: errorMessage,
          data: message
        },
        id: null
      },
      { status }
    );
  }

  /**
   * Validate API key format
   */
  validateApiKeyFormat(apiKey: string): boolean {
    // Basic validation for API key format
    // Adjust according to your API key requirements
    return apiKey.length >= 32 && /^[a-zA-Z0-9_-]+$/.test(apiKey);
  }

  /**
   * Extract API key from request headers
   */
  extractApiKey(request: NextRequest): string | null {
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    return null;
  }

  /**
   * Check if a profile has permission to access a specific tool
   */
  async hasToolPermission(
    profileUuid: string,
    toolName: string
  ): Promise<boolean> {
    try {
      // This is a placeholder for tool permission checking
      // In a real implementation, you would check the profile's permissions
      // against the tool requirements
      
      // For now, we'll return true to allow all tools
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if a profile has permission to access a specific server
   */
  async hasServerPermission(
    profileUuid: string,
    serverUuid: string
  ): Promise<boolean> {
    try {
      // This is a placeholder for server permission checking
      // In a real implementation, you would check the profile's permissions
      // against the server requirements
      
      // For now, we'll return true to allow all servers
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get profile information from API key
   */
  async getProfileFromApiKey(apiKey: string): Promise<{
    profileUuid?: string;
    profileId?: string;
    error?: string;
  }> {
    try {
      const result = await db
        .select({
          profileUuid: profilesTable.uuid
        })
        .from(apiKeysTable)
        .leftJoin(profilesTable, eq(apiKeysTable.project_uuid, profilesTable.project_uuid))
        .where(eq(apiKeysTable.api_key, apiKey))
        .limit(1);

      if (result.length === 0) {
        return { error: 'Invalid API key' };
      }

      return {
        profileUuid: result[0].profileUuid || undefined
      };
    } catch (error) {
      return { error: 'Failed to get profile information' };
    }
  }
}