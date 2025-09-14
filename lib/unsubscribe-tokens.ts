import crypto from 'crypto';
import { db } from '@/db';
import { unsubscribeTokensTable, users } from '@/db/schema';
import { eq, and, gte, isNull } from 'drizzle-orm';

// Secret for HMAC - should be in environment variable
const UNSUBSCRIBE_SECRET = process.env.UNSUBSCRIBE_TOKEN_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  'fallback-secret-change-in-production';

/**
 * Generate a secure unsubscribe token for a user
 */
export async function generateUnsubscribeToken(userId: string): Promise<string> {
  // Generate a random token
  const token = crypto.randomBytes(32).toString('base64url');

  // Create HMAC hash for verification
  const hmac = crypto.createHmac('sha256', UNSUBSCRIBE_SECRET);
  hmac.update(token + userId);
  const tokenHash = hmac.digest('hex');

  // Token expires in 48 hours
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 48);

  // Store token in database
  await db.insert(unsubscribeTokensTable).values({
    userId,
    token,
    tokenHash,
    expiresAt,
  });

  return token;
}

/**
 * Verify and use an unsubscribe token
 * Returns the userId if valid, null otherwise
 */
export async function verifyUnsubscribeToken(token: string): Promise<string | null> {
  try {
    // Find the token in database
    const tokenRecord = await db.query.unsubscribeTokensTable.findFirst({
      where: and(
        eq(unsubscribeTokensTable.token, token),
        gte(unsubscribeTokensTable.expiresAt, new Date()),
        isNull(unsubscribeTokensTable.usedAt)
      ),
    });

    if (!tokenRecord) {
      return null;
    }

    // Verify HMAC hash
    const hmac = crypto.createHmac('sha256', UNSUBSCRIBE_SECRET);
    hmac.update(token + tokenRecord.userId);
    const expectedHash = hmac.digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    if (!crypto.timingSafeEqual(
      Buffer.from(tokenRecord.tokenHash),
      Buffer.from(expectedHash)
    )) {
      console.error('Unsubscribe token HMAC verification failed');
      return null;
    }

    // Mark token as used
    await db
      .update(unsubscribeTokensTable)
      .set({ usedAt: new Date() })
      .where(eq(unsubscribeTokensTable.id, tokenRecord.id));

    return tokenRecord.userId;
  } catch (error) {
    console.error('Error verifying unsubscribe token:', error);
    return null;
  }
}

/**
 * Clean up expired tokens (should be run periodically)
 */
export async function cleanupExpiredTokens(): Promise<void> {
  const now = new Date();

  await db
    .delete(unsubscribeTokensTable)
    .where(
      and(
        gte(unsubscribeTokensTable.expiresAt, now),
        // Also delete tokens that have been used more than 7 days ago
        gte(unsubscribeTokensTable.usedAt, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))
      )
    );
}

/**
 * Generate a secure unsubscribe URL
 */
export async function generateUnsubscribeUrl(userId: string): Promise<string> {
  const token = await generateUnsubscribeToken(userId);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:12005';
  return `${appUrl}/unsubscribe?token=${encodeURIComponent(token)}`;
}