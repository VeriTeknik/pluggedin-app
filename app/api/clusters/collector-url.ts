import { ipLiteralFromHost, isPrivateAddress } from '@/lib/security/validators';

/**
 * Hosts that name something internal without being an address.
 *
 * Addresses are not listed here — they are decided by isPrivateAddress, which
 * covers every private and reserved range rather than the handful someone
 * happened to think of. This list is only for names.
 */
const BLOCKED_HOST_NAMES = [
  'localhost',
  'metadata.google.internal',
  'metadata.goog',
  'kubernetes.default',
  'kubernetes.default.svc',
];

/**
 * Whether a cluster collector URL may be fetched.
 *
 * This file exists because the check used to live inline in route.ts with its
 * own BLOCKED_HOSTS array and its own isPrivateNetwork() — a third
 * implementation of a rule that already had two, and one that carried the same
 * defect: it compared the text of `new URL(url).hostname`, which is bracketed
 * for IPv6 and hex-canonicalised for IPv4-mapped addresses, so `[fe80::1]` and
 * `[::ffff:7f00:1]` matched nothing (GHSA-gmhc-h765-37cg).
 *
 * It now shares the classifier with the other two guards. Extracted rather than
 * left in the route so it can be tested directly.
 */
export function isCollectorUrlAllowed(url: string): boolean {
  // Private *addresses* were already allowed under NODE_ENV=development, so a
  // developer can point at a collector on the LAN. Names that mean something
  // internal were blocked in every environment. Both behaviours are preserved
  // deliberately — this change is about which addresses are recognised, not
  // about tightening what is permitted.
  const isDevelopment = process.env.NODE_ENV === 'development';

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // A trailing dot root-qualifies a name: `localhost.` reaches localhost
  // without equalling it.
  const hostname = parsed.hostname.toLowerCase().replace(/\.+$/, '');

  if (BLOCKED_HOST_NAMES.includes(hostname) || hostname.endsWith('.localhost')) {
    return false;
  }

  const literal = ipLiteralFromHost(hostname);
  if (literal === null) {
    return true; // a name; nothing to classify until it is resolved
  }

  return isDevelopment || !isPrivateAddress(literal);
}
