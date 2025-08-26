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
   */
  async authenticateRequest(request: NextRequest): Promise<{
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

      // Try API key authentication
      const authHeader = request.headers.get('authorization');
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const apiKey = authHeader.slice(7);
        const apiKeyResult = await this.authenticateWithApiKey(apiKey);
        if (apiKeyResult.success) {
          return {
            ...apiKeyResult,
            authMethod: 'api_key'
          };
        }
      }

      // Try OAuth token authentication
      const oauthToken = request.headers.get('x-oauth-token');
      if (oauthToken) {
        const oauthResult = await this.authenticateWithOAuth(oauthToken);
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
        error: this.createAuthError('Authentication required. Please provide a valid session, API key, or OAuth token.')
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
          error: this.createAuthError('No active session')
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
          error: this.createAuthError('No active profile found')
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
          error: this.createAuthError('Invalid API key')
        };
      }

      const { profileUuid } = result[0];
      
      if (!profileUuid) {
        return {
          success: false,
          error: this.createAuthError('Profile not found')
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
  private async authenticateWithOAuth(token: string): Promise<{
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
          error: this.createAuthError(validation.error || 'Invalid OAuth token')
        };
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
   * Create authentication error response
   */
  private createAuthError(message: string): NextResponse {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Authentication failed',
          data: message
        },
        id: null
      },
      { status: 401 }
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