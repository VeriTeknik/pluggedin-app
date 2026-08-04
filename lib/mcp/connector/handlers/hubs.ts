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

import { mintHubHandle, readHubHandle } from '../handles';

export interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

function text(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function failure(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

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

/**
 * Resolves whatever the caller passed — a minted handle, or a Hub name — to a
 * granted project. The granted set is the authority; the handle is only a
 * convenience, so an unreadable one falls through to the name lookup rather
 * than failing differently.
 */
export function resolveGrantedHub(
  identity: ConnectorIdentity,
  argument: string,
  byName: { uuid: string; name: string }[]
): string | undefined {
  const fromHandle = readHubHandle(argument, identity.tokenUuid);
  if (fromHandle && identity.grantedProjectUuids.includes(fromHandle)) return fromHandle;

  const named = byName.find((row) => row.name === argument);
  if (named && identity.grantedProjectUuids.includes(named.uuid)) return named.uuid;

  return undefined;
}

export async function openHub(
  identity: ConnectorIdentity,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const argument = typeof params.hub === 'string' ? params.hub.trim() : '';
  if (!argument) return failure('hub is required: pass a name or a handle from pluggedin_list_hubs');

  const granted = identity.grantedProjectUuids;
  if (granted.length === 0) return failure('No Hubs were granted to this connection.');

  const rows = await db
    .select({ uuid: projectsTable.uuid, name: projectsTable.name })
    .from(projectsTable)
    .where(inArray(projectsTable.uuid, granted));

  const projectUuid = resolveGrantedHub(identity, argument, rows);
  if (!projectUuid) {
    // Deliberately the same answer whether the Hub does not exist or exists and
    // was not granted. Distinguishing them would let a caller enumerate other
    // people's Hub names one guess at a time.
    return failure(`No granted Hub matches "${argument}". Use pluggedin_list_hubs to see them.`);
  }

  // Server state keyed to a credential, not protocol session state: this is a
  // per-token convenience so the next call need not repeat the choice. It does
  // not reintroduce what SEP-2567 removed, because nothing about the connection
  // carries it — a different token has a different default.
  await db
    .update(oauthAccessTokensTable)
    .set({ default_project_uuid: projectUuid })
    .where(eq(oauthAccessTokensTable.uuid, identity.tokenUuid));

  const opened = rows.find((row) => row.uuid === projectUuid);
  return text({
    opened: opened?.name,
    handle: mintHubHandle(identity.tokenUuid, projectUuid),
    note: 'Pass this handle as the `hub` argument on subsequent calls.',
  });
}
