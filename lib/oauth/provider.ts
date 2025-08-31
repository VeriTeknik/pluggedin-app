import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';

import { db } from '@/db';
import {
  oauthAuthorizationCodesTable,
  oauthClientsTable,
  oauthTokensTable,
} from '@/db/schema';

const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  32
);

const nanoidLong = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  64
);

/**
 * Hash a token for secure storage
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a secure random token
 */
export function generateToken(prefix?: string): string {
  const token = nanoidLong();
  return prefix ? `${prefix}_${token}` : token;
}

/**
 * Generate a secure authorization code
 */
export function generateAuthCode(): string {
  return nanoid();
}

/**
 * Verify PKCE code challenge
 */
export function verifyPKCEChallenge(
  verifier: string,
  challenge: string,
  method: string = 'S256'
): boolean {
  if (method === 'plain') {
    return verifier === challenge;
  }
  
  if (method === 'S256') {
    const hash = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url');
    return hash === challenge;
  }
  
  return false;
}

/**
 * OAuth Provider class for handling OAuth flows
 */
export class OAuthProvider {
  private static instance: OAuthProvider;

  static getInstance(): OAuthProvider {
    if (!OAuthProvider.instance) {
      OAuthProvider.instance = new OAuthProvider();
    }
    return OAuthProvider.instance;
  }

  /**
   * Register a new OAuth client (Dynamic Client Registration)
   */
  async registerClient(params: {
    name: string;
    redirectUris: string[];
    grantTypes?: string[];
    responseTypes?: string[];
    scope?: string;
  }) {
    const clientId = `client_${nanoid()}`;
    const clientSecret = `secret_${nanoidLong()}`;
    
    try {
      await db
        .insert(oauthClientsTable)
        .values({
          clientId,
          clientSecretHash: hashToken(clientSecret),
          name: params.name,
          redirectUris: params.redirectUris,
          grantTypes: params.grantTypes,
          responseTypes: params.responseTypes,
          scope: params.scope,
        });

      return {
        success: true,
        client: {
          clientId,
          clientSecret, // Only returned once during registration
          name: params.name,
          redirectUris: params.redirectUris,
        },
      };
    } catch (error) {
      console.error('Failed to register OAuth client:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to register client',
      };
    }
  }

  /**
   * Validate client credentials
   */
  async validateClient(clientId: string, clientSecret?: string) {
    try {
      // Special handling for default MCP connector
      if (clientId === 'mcp-connector') {
        // Check if it exists in the database
        const [existingClient] = await db
          .select()
          .from(oauthClientsTable)
          .where(eq(oauthClientsTable.clientId, clientId))
          .limit(1);

        if (existingClient) {
          // Validate secret if provided
          if (clientSecret) {
            const secretHash = hashToken(clientSecret);
            if (existingClient.clientSecretHash !== secretHash) {
              return { valid: false, error: 'Invalid client credentials' };
            }
          }
          return { valid: true, client: existingClient };
        }

        // Auto-create the default MCP connector client if it doesn't exist
        const defaultSecret = 'mcp_connector_default_secret_' + nanoid();
        const [newClient] = await db
          .insert(oauthClientsTable)
          .values({
            clientId: 'mcp-connector',
            clientSecretHash: hashToken(defaultSecret),
            name: 'MCP Connector',
            redirectUris: [
              'http://localhost:12005/api/mcp/oauth/callback',
              'https://plugged.in/api/mcp/oauth/callback',
              'http://localhost:3000/api/mcp/oauth/callback',
            ],
            grantTypes: ['authorization_code'],
            responseTypes: ['code'],
            scope: 'mcp:read mcp:execute',
          })
          .returning();

        console.log('[OAuth] Auto-created default MCP connector client');
        return { valid: true, client: newClient };
      }

      // Regular client validation
      const [client] = await db
        .select()
        .from(oauthClientsTable)
        .where(eq(oauthClientsTable.clientId, clientId))
        .limit(1);

      if (!client) {
        return { valid: false, error: 'Client not found' };
      }

      // If client secret is provided, verify it
      if (clientSecret) {
        const secretHash = hashToken(clientSecret);
        if (client.clientSecretHash !== secretHash) {
          return { valid: false, error: 'Invalid client credentials' };
        }
      }

      return { valid: true, client };
    } catch (error) {
      console.error('Failed to validate client:', error);
      return { valid: false, error: 'Validation failed' };
    }
  }

  /**
   * Create authorization code
   */
  async createAuthorizationCode(params: {
    clientId: string;
    profileUuid: string;
    redirectUri: string;
    scope: string;
    resource?: string; // RFC 8707 - Resource Indicators
    codeChallenge?: string;
    codeChallengeMethod?: string;
  }) {
    const code = generateAuthCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes
    
    console.log('[OAuth] Creating authorization code:', {
      code,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      resource: params.resource,
      expiresInMs: 10 * 60 * 1000
    });

    try {
      await db.insert(oauthAuthorizationCodesTable).values({
        code,
        clientId: params.clientId,
        profileUuid: params.profileUuid,
        redirectUri: params.redirectUri,
        scope: params.scope,
        resource: params.resource,
        codeChallenge: params.codeChallenge,
        codeChallengeMethod: params.codeChallengeMethod,
        expiresAt,
      });

      return { success: true, code };
    } catch (error) {
      console.error('Failed to create authorization code:', error);
      return { success: false, error: 'Failed to create code' };
    }
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(params: {
    code: string;
    clientId: string;
    clientSecret?: string;
    redirectUri: string;
    codeVerifier?: string;
  }) {
    try {
      console.log('[OAuth] Exchanging code for tokens:', {
        code: params.code,
        clientId: params.clientId,
        redirectUri: params.redirectUri,
        hasCodeVerifier: !!params.codeVerifier
      });

      // Get and validate the authorization code
      const [authCode] = await db
        .select()
        .from(oauthAuthorizationCodesTable)
        .where(
          and(
            eq(oauthAuthorizationCodesTable.code, params.code),
            eq(oauthAuthorizationCodesTable.clientId, params.clientId)
          )
        )
        .limit(1);

      if (!authCode) {
        // Try to find just by code to see if it's a client mismatch
        const [codeOnly] = await db
          .select()
          .from(oauthAuthorizationCodesTable)
          .where(eq(oauthAuthorizationCodesTable.code, params.code))
          .limit(1);
        
        if (codeOnly) {
          console.error('[OAuth] Code found but client mismatch:', {
            expectedClient: params.clientId,
            actualClient: codeOnly.clientId
          });
          return { success: false, error: 'Client mismatch for authorization code' };
        }
        return { success: false, error: 'Invalid authorization code' };
      }

      // Check if code is expired (using UTC consistently)
      const now = new Date();
      const codeExpiresAt = new Date(authCode.expiresAt);
      const isExpired = codeExpiresAt.getTime() < now.getTime();
      
      console.log('[OAuth] Code validation:', {
        codeCreated: authCode.createdAt,
        codeExpires: authCode.expiresAt,
        expiresAtISO: codeExpiresAt.toISOString(),
        currentTime: now.toISOString(),
        isExpired,
        timeUntilExpiry: codeExpiresAt.getTime() - now.getTime()
      });
      
      if (isExpired) {
        return { success: false, error: 'Authorization code expired' };
      }

      // Check if code was already used
      if (authCode.usedAt) {
        return { success: false, error: 'Authorization code already used' };
      }

      // Validate redirect URI
      if (authCode.redirectUri !== params.redirectUri) {
        return { success: false, error: 'Redirect URI mismatch' };
      }

      // Verify PKCE if present
      if (authCode.codeChallenge) {
        if (!params.codeVerifier) {
          return { success: false, error: 'Code verifier required' };
        }
        
        const valid = verifyPKCEChallenge(
          params.codeVerifier,
          authCode.codeChallenge,
          authCode.codeChallengeMethod || 'S256'
        );
        
        if (!valid) {
          return { success: false, error: 'Invalid code verifier' };
        }
      }

      // Mark code as used
      await db
        .update(oauthAuthorizationCodesTable)
        .set({ usedAt: new Date() })
        .where(eq(oauthAuthorizationCodesTable.code, params.code));

      // Create access and refresh tokens
      const accessToken = generateToken('plg_access');
      const refreshToken = generateToken('plg_refresh');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db.insert(oauthTokensTable).values({
        accessTokenHash: hashToken(accessToken),
        refreshTokenHash: hashToken(refreshToken),
        clientId: authCode.clientId,
        profileUuid: authCode.profileUuid,
        scope: authCode.scope,
        resource: authCode.resource, // Include resource from authorization code
        expiresAt,
      });

      return {
        success: true,
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
          token_type: 'Bearer',
          expires_in: 3600,
          scope: authCode.scope,
        },
      };
    } catch (error) {
      console.error('Failed to exchange code for tokens:', error);
      return { success: false, error: 'Token exchange failed' };
    }
  }

  /**
   * Validate access token and get associated profile
   */
  async validateAccessToken(token: string) {
    try {
      const tokenHash = hashToken(token);
      
      const [tokenRecord] = await db
        .select()
        .from(oauthTokensTable)
        .where(eq(oauthTokensTable.accessTokenHash, tokenHash))
        .limit(1);

      if (!tokenRecord) {
        return { valid: false, error: 'Invalid token' };
      }

      // Check if token is expired
      if (tokenRecord.expiresAt < new Date()) {
        return { valid: false, error: 'Token expired' };
      }

      // Update last used timestamp
      await db
        .update(oauthTokensTable)
        .set({ lastUsedAt: new Date() })
        .where(eq(oauthTokensTable.accessTokenHash, tokenHash));

      return {
        valid: true,
        profileUuid: tokenRecord.profileUuid,
        clientId: tokenRecord.clientId,
        scope: tokenRecord.scope,
        resource: tokenRecord.resource, // Include resource for audience validation
      };
    } catch (error) {
      console.error('Failed to validate access token:', error);
      return { valid: false, error: 'Validation failed' };
    }
  }

  /**
   * Refresh access token with optional refresh token rotation
   */
  async refreshAccessToken(refreshToken: string, clientId: string) {
    try {
      const refreshTokenHash = hashToken(refreshToken);
      
      const [tokenRecord] = await db
        .select()
        .from(oauthTokensTable)
        .where(
          and(
            eq(oauthTokensTable.refreshTokenHash, refreshTokenHash),
            eq(oauthTokensTable.clientId, clientId)
          )
        )
        .limit(1);

      if (!tokenRecord) {
        return { success: false, error: 'Invalid refresh token' };
      }

      // Check if refresh token itself has an expiry (optional security measure)
      // Refresh tokens should have a longer expiry (e.g., 30 days)
      const refreshTokenAge = Date.now() - tokenRecord.createdAt.getTime();
      const maxRefreshTokenAge = 30 * 24 * 60 * 60 * 1000; // 30 days
      
      if (refreshTokenAge > maxRefreshTokenAge) {
        // Revoke the expired refresh token
        await db
          .delete(oauthTokensTable)
          .where(eq(oauthTokensTable.id, tokenRecord.id));
        
        return { success: false, error: 'Refresh token expired' };
      }

      // Generate new access token
      const newAccessToken = generateToken('plg_access');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Implement refresh token rotation for enhanced security
      // Generate a new refresh token on each refresh (recommended by OAuth 2.0 Security BCP)
      const newRefreshToken = generateToken('plg_refresh');
      
      // Update the token record with both new tokens
      await db
        .update(oauthTokensTable)
        .set({
          accessTokenHash: hashToken(newAccessToken),
          refreshTokenHash: hashToken(newRefreshToken), // Rotate refresh token
          expiresAt,
          lastUsedAt: new Date(),
        })
        .where(eq(oauthTokensTable.id, tokenRecord.id));

      return {
        success: true,
        tokens: {
          access_token: newAccessToken,
          refresh_token: newRefreshToken, // Return new refresh token
          token_type: 'Bearer',
          expires_in: 3600,
          scope: tokenRecord.scope,
        },
      };
    } catch (error) {
      console.error('Failed to refresh access token:', error);
      return { success: false, error: 'Token refresh failed' };
    }
  }

  /**
   * Revoke a token
   */
  async revokeToken(token: string) {
    try {
      const tokenHash = hashToken(token);
      
      // Try to delete as access token
      const accessResult = await db
        .delete(oauthTokensTable)
        .where(eq(oauthTokensTable.accessTokenHash, tokenHash));

      // If not found as access token, try refresh token
      if (!accessResult.rowCount) {
        await db
          .delete(oauthTokensTable)
          .where(eq(oauthTokensTable.refreshTokenHash, tokenHash));
      }

      return { success: true };
    } catch (error) {
      console.error('Failed to revoke token:', error);
      return { success: false, error: 'Revocation failed' };
    }
  }
}

export const oauthProvider = OAuthProvider.getInstance();