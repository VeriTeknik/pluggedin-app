/**
 * OAuth configuration storage
 * Stores discovered OAuth endpoints and configuration in the database
 */

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { mcpServerOAuthConfigTable } from '@/db/schema';
import { encryptField } from '@/lib/encryption';
import { log } from '@/lib/observability/logger';

import type { OAuthMetadata } from './rfc9728-discovery';

export interface OAuthConfigInput {
  serverUuid: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string;
  authorizationServer: string;
  resourceIdentifier?: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string[];
  supportsPKCE?: boolean;
  discoveryMethod: 'rfc9728' | 'www-authenticate' | 'manual';
}

/**
 * Store OAuth configuration for a server
 */
export async function storeOAuthConfig(config: OAuthConfigInput): Promise<void> {
  try {
    // Check if OAuth config already exists for this server
    const existing = await db.query.mcpServerOAuthConfigTable.findFirst({
      where: eq(mcpServerOAuthConfigTable.server_uuid, config.serverUuid),
    });

    // Encrypt client secret if provided
    const clientSecretEncrypted = config.clientSecret
      ? encryptField(config.clientSecret)
      : null;

    const configData = {
      server_uuid: config.serverUuid,
      authorization_endpoint: config.authorizationEndpoint,
      token_endpoint: config.tokenEndpoint,
      registration_endpoint: config.registrationEndpoint || null,
      authorization_server: config.authorizationServer,
      resource_identifier: config.resourceIdentifier || null,
      client_id: config.clientId || null,
      client_secret_encrypted: clientSecretEncrypted,
      scopes: config.scopes || null,
      supports_pkce: config.supportsPKCE ?? true, // Default to true (PKCE is recommended)
      discovery_method: config.discoveryMethod,
    };

    if (existing) {
      // Update existing config
      await db
        .update(mcpServerOAuthConfigTable)
        .set({
          ...configData,
          updated_at: new Date(),
        })
        .where(eq(mcpServerOAuthConfigTable.server_uuid, config.serverUuid));

      log.oauth('oauth_config_updated', {
        serverUuid: config.serverUuid,
        discoveryMethod: config.discoveryMethod
      });
    } else {
      // Insert new config
      await db.insert(mcpServerOAuthConfigTable).values(configData);

      log.oauth('oauth_config_stored', {
        serverUuid: config.serverUuid,
        discoveryMethod: config.discoveryMethod
      });
    }
  } catch (error) {
    log.error('OAuth Config: Error storing OAuth config', error, {
      serverUuid: config.serverUuid
    });
    throw error;
  }
}

/**
 * Get OAuth configuration for a server
 */
export async function getOAuthConfig(serverUuid: string) {
  try {
    const config = await db.query.mcpServerOAuthConfigTable.findFirst({
      where: eq(mcpServerOAuthConfigTable.server_uuid, serverUuid),
    });

    return config || null;
  } catch (error) {
    log.error('OAuth Config: Error getting OAuth config', error, { serverUuid });
    return null;
  }
}

/**
 * Store OAuth configuration from discovered metadata
 */
export async function storeDiscoveredOAuthConfig(
  serverUuid: string,
  metadata: OAuthMetadata,
  authServer: string,
  resourceId: string | null,
  discoveryMethod: 'rfc9728' | 'www-authenticate' | 'manual'
): Promise<void> {
  await storeOAuthConfig({
    serverUuid,
    authorizationEndpoint: metadata.authorization_endpoint,
    tokenEndpoint: metadata.token_endpoint,
    registrationEndpoint: metadata.registration_endpoint,
    authorizationServer: authServer,
    resourceIdentifier: resourceId,
    scopes: metadata.scopes_supported,
    supportsPKCE: metadata.code_challenge_methods_supported?.includes('S256') ?? true,
    discoveryMethod,
  });
}
