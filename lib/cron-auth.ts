import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Timing-safe comparison of secret strings for cron job authorization.
 *
 * Why HMAC-SHA256 digests? Both `a` and `b` are always exactly 32 bytes
 * regardless of input length, so timingSafeEqual never leaks the secret's
 * length through an early-return on Buffer.length mismatch.
 */
export function verifyCronSecret(provided: string | null): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || !provided) return false;
  const key = Buffer.from(expected);
  const a = createHmac('sha256', key).update(provided).digest();
  const b = createHmac('sha256', key).update(expected).digest();
  return timingSafeEqual(a, b);
}
