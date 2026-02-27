/**
 * Model Router JWT Token Management
 *
 * Generates and validates JWT tokens for agent authentication with the Model Router service.
 * Tokens are signed using HS256 with MODEL_ROUTER_JWT_SECRET and have a 1-year expiration.
 */

import * as jose from 'jose';

const MODEL_ROUTER_JWT_SECRET = process.env.MODEL_ROUTER_JWT_SECRET;

/**
 * Generate a JWT token for an agent to authenticate with the Model Router
 *
 * @param agentId - UUID of the agent
 * @param agentName - Name of the agent
 * @returns JWT token string
 * @throws Error if MODEL_ROUTER_JWT_SECRET is not configured
 */
export async function generateModelRouterToken(
  agentId: string,
  agentName: string
): Promise<string> {
  if (!MODEL_ROUTER_JWT_SECRET) {
    throw new Error('MODEL_ROUTER_JWT_SECRET not configured');
  }

  const secret = new TextEncoder().encode(MODEL_ROUTER_JWT_SECRET);

  const token = await new jose.SignJWT({
    sub: agentId,
    name: agentName,
    type: 'agent',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('365d') // 1 year, can be revoked manually
    .setIssuer('plugged.in')
    .setAudience('model-router')
    .sign(secret);

  return token;
}

/**
 * Verify a Model Router JWT token
 *
 * @param token - JWT token string
 * @returns Decoded token payload
 * @throws Error if token is invalid or expired
 */
export async function verifyModelRouterToken(token: string): Promise<{
  sub: string;
  name: string;
  type: string;
  iat: number;
  exp: number;
  iss: string;
}> {
  if (!MODEL_ROUTER_JWT_SECRET) {
    throw new Error('MODEL_ROUTER_JWT_SECRET not configured');
  }

  const secret = new TextEncoder().encode(MODEL_ROUTER_JWT_SECRET);

  const { payload } = await jose.jwtVerify(token, secret, {
    issuer: 'plugged.in',
    audience: 'model-router',
  });

  return payload as any;
}
