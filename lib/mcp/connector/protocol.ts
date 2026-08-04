/**
 * The slice of MCP 2026-07-28 the hosted connector actually speaks.
 *
 * The plan calls for extracting pluggedin-mcp/src/protocol/ into a shared
 * package, and that is still the right end state. It is not a prerequisite for
 * this endpoint: the connector speaks one revision and never bridges to an
 * older one, so it needs the version constant, the JSON-RPC envelope and the
 * discover payload — not the bridging modules (`lower`, `registry`) that exist
 * for the local proxy's deprecation window. Extracting a package to obtain
 * three constants would couple this route to a release process it does not
 * need yet.
 */

/** Revisions this endpoint answers for, oldest first. */
export const REVISIONS = ['2026-07-28'] as const;
export type Revision = (typeof REVISIONS)[number];
export const LATEST_REVISION: Revision = '2026-07-28';

export const SERVER_INFO = Object.freeze({
  name: 'pluggedin',
  title: 'Plugged.in',
  version: '1.0.0',
});

/** JSON-RPC 2.0 error codes, plus the MCP-specific ones we return. */
export const JSONRPC = Object.freeze({
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
});

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * A request without an `id` is a notification: JSON-RPC forbids replying to
 * one, and MCP clients send them for lifecycle events like
 * `notifications/initialized`. Answering anyway is a protocol violation that
 * some clients surface as a hard error.
 */
export function isNotification(body: JsonRpcRequest): boolean {
  return body.id === undefined;
}

export function parseJsonRpc(
  raw: unknown
): { ok: true; request: JsonRpcRequest } | { ok: false; code: number; message: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, code: JSONRPC.INVALID_REQUEST, message: 'Request must be a JSON object' };
  }
  const body = raw as Record<string, unknown>;
  if (body.jsonrpc !== '2.0') {
    return { ok: false, code: JSONRPC.INVALID_REQUEST, message: 'jsonrpc must be "2.0"' };
  }
  if (typeof body.method !== 'string' || body.method === '') {
    return { ok: false, code: JSONRPC.INVALID_REQUEST, message: 'method is required' };
  }
  const id = body.id;
  if (id !== undefined && id !== null && typeof id !== 'string' && typeof id !== 'number') {
    return { ok: false, code: JSONRPC.INVALID_REQUEST, message: 'id must be a string or number' };
  }

  return {
    ok: true,
    request: {
      jsonrpc: '2.0',
      ...(id === undefined ? {} : { id: id as string | number | null }),
      method: body.method,
      params:
        body.params && typeof body.params === 'object' && !Array.isArray(body.params)
          ? (body.params as Record<string, unknown>)
          : undefined,
    },
  };
}

export function jsonRpcResult(id: JsonRpcRequest['id'], result: unknown) {
  return { jsonrpc: '2.0' as const, id: id ?? null, result };
}

export function jsonRpcError(id: JsonRpcRequest['id'], code: number, message: string, data?: unknown) {
  return {
    jsonrpc: '2.0' as const,
    id: id ?? null,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  };
}

/**
 * `server/discover` is answered before authentication, because it *is* the
 * negotiation: a client that cannot discover what we speak has no way to reach
 * the point of authenticating. It carries no user data — only what this server
 * is and which revisions it answers for.
 */
export function buildDiscoverResult() {
  return {
    resultType: 'complete' as const,
    // Newest first: clients take the first entry they recognise.
    protocolVersions: [...REVISIONS].reverse(),
    capabilities: {
      tools: { listChanged: false },
    },
    serverInfo: SERVER_INFO,
  };
}

export function buildInitializeResult(requested?: string) {
  // Echo the client's revision when we speak it, otherwise state ours and let
  // the client decide. Silently answering in a different revision than the one
  // asked for is how version mismatches become mysterious tool failures.
  const protocolVersion =
    requested && (REVISIONS as readonly string[]).includes(requested) ? requested : LATEST_REVISION;

  return {
    protocolVersion,
    capabilities: { tools: { listChanged: false } },
    serverInfo: SERVER_INFO,
  };
}
