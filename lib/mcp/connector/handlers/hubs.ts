/**
 * Hub selection over MCP.
 *
 * Claude does not tell us which Project a request came from — neither the
 * authentication documentation nor the 2026-07-28 reserved `_meta` keys carry a
 * project identifier, and `clientInfo` is only `{name, version, title}`. So
 * automatic Hub selection is not achievable at the protocol level, and these
 * two tools are the honest substitute: list what was granted, open one of them.
 *
 * Runtime switching is permitted within the Hub set granted at consent, never
 * outside it. That set is fixed when the user approves; these tools cannot
 * widen it.
 */

import { eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { oauthAccessTokensTable, projectsTable } from '@/db/schema';
import type { ConnectorIdentity } from '@/lib/oauth/provider/authenticate';

import { toolFailure as failure, toolText as text, type ToolResult } from '../tool-result';

import { mintHubHandle } from '../handles';
import { requireGrantedHub } from '../hub-scope';

export async function listHubs(identity: ConnectorIdentity): Promise<ToolResult> {
  if (identity.grantedProjectUuids.length === 0) {
    return text({ hubs: [], note: 'No Hubs were granted to this connection.' });
  }

  const rows = await db
    .select({ uuid: projectsTable.uuid, name: projectsTable.name })
    .from(projectsTable)
    .where(inArray(projectsTable.uuid, identity.grantedProjectUuids));

  // Ordered by name so repeated calls read the same way; the model is choosing
  // from this list and a shifting order makes that harder than it needs to be.
  const hubs = rows
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((row) => ({
      name: row.name,
      handle: mintHubHandle(identity.tokenUuid, row.uuid),
      isDefault: row.uuid === identity.defaultProjectUuid,
    }));

  return text({ hubs });
}

export async function openHub(
  identity: ConnectorIdentity,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const argument = typeof params.hub === 'string' ? params.hub.trim() : '';
  if (!argument) return failure('hub is required: pass a name or a handle from pluggedin_list_hubs');

  // The same gate every other handler goes through, so opening a Hub cannot
  // reach one that was never granted.
  const resolved = await requireGrantedHub(identity, argument);
  if (!resolved.ok) return failure(resolved.message);

  // Server state keyed to a credential, not protocol session state: this is a
  // per-token convenience so the next call need not repeat the choice. It does
  // not reintroduce what SEP-2567 removed, because nothing about the connection
  // carries it — a different token has a different default.
  //
  // The Hub can be deleted between the read above and this write, and the
  // foreign key then rejects it. That is a narrow race but a real one, and the
  // generic handler would report it as "Internal error" — which tells the user
  // nothing and reads like an outage. 23503 is Postgres's foreign-key
  // violation; here it means precisely one thing, so it is named.
  try {
    await db
      .update(oauthAccessTokensTable)
      .set({ default_project_uuid: resolved.hub })
      .where(eq(oauthAccessTokensTable.uuid, identity.tokenUuid));
  } catch (error) {
    if ((error as { code?: string })?.code === '23503') {
      return failure(`The Hub "${argument}" no longer exists.`);
    }
    throw error;
  }

  return text({
    opened: resolved.name,
    handle: mintHubHandle(identity.tokenUuid, resolved.hub),
    note: 'Pass this handle as the `hub` argument on subsequent calls.',
  });
}
