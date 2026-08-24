/**
 * The one way a connector handler obtains a Hub.
 *
 * The shared library actions take `projectUuid?: string` and fall back to every
 * document the *user* owns when it is absent:
 *
 *     } else {
 *       // Fallback: get all documents for user
 *       docs = await db.query.docsTable.findMany({ where: eq(docsTable.user_id, userId) })
 *     }
 *
 * In the web UI that is defensible — the boundary there is the user, browsing
 * their own data in their own session, and showing everything when no Hub is
 * selected is a product decision. In the connector the boundary is different:
 * it is the Hub set granted at consent. A token granted Hub A must not read Hub
 * B, even though one person owns both. So the same fallback that is harmless in
 * one caller silently widens authorization in the other.
 *
 * Making projectUuid required in the shared actions would fix the connector by
 * breaking the UI, for no gain on the UI's side. The boundary belongs here.
 *
 * `GrantedHub` is a branded string that only requireGrantedHub can produce, and
 * handlers take that type rather than `string`. Passing a raw uuid, a Hub from
 * another user, or nothing at all is then a compile error rather than a silent
 * widening — which matters more than a runtime check, because the failure this
 * guards has no symptom: the wrong documents come back and everything looks
 * like it worked.
 */

import { inArray } from 'drizzle-orm';

import { db } from '@/db';
import { projectsTable } from '@/db/schema';
import type { ConnectorIdentity } from '@/lib/oauth/provider/authenticate';

import { readHubHandle } from './handles';

declare const grantedHubBrand: unique symbol;

/** A project uuid proven to be in this token's granted set. */
export type GrantedHub = string & { readonly [grantedHubBrand]: 'GrantedHub' };

export type HubResolution =
  | { ok: true; hub: GrantedHub; name: string }
  | { ok: false; message: string };

/**
 * Resolves the Hub a call should run against.
 *
 * Order: what the caller named, then this token's remembered default, then the
 * only granted Hub if there is exactly one. Anything else asks rather than
 * guesses — picking a Hub for a user who has several would put their documents
 * in front of a model they did not point at them.
 */
export async function requireGrantedHub(
  identity: ConnectorIdentity,
  argument?: unknown
): Promise<HubResolution> {
  const granted = identity.grantedProjectUuids;
  if (granted.length === 0) {
    return { ok: false, message: 'No Hubs were granted to this connection.' };
  }

  // Read the granted Hubs once. Names are needed to answer by name and to
  // report back, and the query is bounded by the granted set, so a Hub outside
  // it cannot appear here at all.
  const rows = await db
    .select({ uuid: projectsTable.uuid, name: projectsTable.name })
    .from(projectsTable)
    .where(inArray(projectsTable.uuid, granted));

  // The granted set can outlive the Hubs in it: a Hub deleted after consent
  // leaves its uuid on the token. Without this the caller fell through to
  // "several Hubs are available, open one" — false, since none are, and it
  // pointed at a tool that would fail the same way. A wrong message that
  // recommends a dead end is worse than no message.
  if (rows.length === 0) {
    return {
      ok: false,
      message:
        'The Hubs granted to this connection no longer exist. Re-authorize the connector to choose current ones.',
    };
  }

  const asked = typeof argument === 'string' ? argument.trim() : '';
  if (asked) {
    const fromHandle = readHubHandle(asked, identity.tokenUuid);
    const match =
      rows.find((row) => row.uuid === fromHandle) ?? rows.find((row) => row.name === asked);

    if (!match) {
      // The same answer whether the Hub does not exist or exists and was not
      // granted. Telling them apart would let a caller enumerate other people's
      // Hub names one guess at a time.
      return {
        ok: false,
        message: `No granted Hub matches "${asked}". Use pluggedin_list_hubs to see them.`,
      };
    }
    return { ok: true, hub: match.uuid as GrantedHub, name: match.name };
  }

  // The remembered default, but only if it is still granted. A Hub can leave
  // the set — re-authorization with a narrower selection — while the column
  // still points at it.
  const remembered = rows.find((row) => row.uuid === identity.defaultProjectUuid);
  if (remembered) {
    return { ok: true, hub: remembered.uuid as GrantedHub, name: remembered.name };
  }

  if (rows.length === 1) {
    return { ok: true, hub: rows[0].uuid as GrantedHub, name: rows[0].name };
  }

  return {
    ok: false,
    message:
      'Several Hubs are available and none is open. Call pluggedin_open_hub first, or pass one as the `hub` argument.',
  };
}
