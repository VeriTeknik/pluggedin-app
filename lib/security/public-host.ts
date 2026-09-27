import dns from 'node:dns/promises';

import { ipLiteralFromHost, isPrivateAddress } from '@/lib/security/validators';

/**
 * Refuse a hostname unless every address behind it is globally routable.
 *
 * For a destination handed to a *subprocess* - which resolves the name itself,
 * so the socket cannot be pinned the way safeFetch pins it. validateUrlForSSRF
 * judges only the text of a URL, and `internal.attacker.example` is ordinary
 * text whose A record can be 127.0.0.1.
 *
 * Any private address rejects the host, rather than picking a public one out of
 * the set: nothing here decides which address the child will use.
 *
 * What this does not do: the child resolves the name again, so a host that
 * answers differently the second time (DNS rebinding) is not stopped, and nor
 * is anything the child is redirected or referred to afterwards. That needs
 * egress control on the child's network, not a check in this process.
 */
export async function assertHostResolvesPublic(hostname: string): Promise<void> {
  const literal = ipLiteralFromHost(hostname);
  if (literal !== null) {
    if (isPrivateAddress(literal)) {
      throw new Error(`Address ${hostname} is private or reserved, which is not allowed`);
    }
    return;
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error(`Host ${hostname} could not be resolved`);
  }

  if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error(
      `Host ${hostname} resolves to a private or reserved address, which is not allowed`
    );
  }
}
