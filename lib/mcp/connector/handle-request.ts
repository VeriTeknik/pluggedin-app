/**
 * The hosted connector's request handler: one POST in, one JSON-RPC response
 * out, nothing held in between.
 *
 * MCP 2026-07-28 made the protocol stateless — SEP-2567 removed sessions and
 * the Mcp-Session-Id header — so this is exactly the shape of a route handler.
 * No stream to keep open, no sticky routing, no session table.
 */

import { authenticateConnectorRequest } from '@/lib/oauth/provider/authenticate';

import {
  dispatchAuthenticated,
  dispatchPublic,
  isPublicMethod,
} from './dispatch';
import {
  isNotification,
  JSONRPC,
  jsonRpcError,
  jsonRpcResult,
  parseJsonRpc,
} from './protocol';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // Nothing here is cacheable: every response depends on the bearer token.
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Whether a body asks for something answerable without a credential.
 *
 * The route needs this before it can decide where to send the request: a
 * discover call carries no token and still belongs here, because negotiating
 * is what a client does *before* it can authenticate.
 */
export function isPublicConnectorRequest(raw: unknown): boolean {
  const parsed = parseJsonRpc(raw);
  return parsed.ok && isPublicMethod(parsed.request.method);
}

export async function handleConnectorRequest(req: Request, raw: unknown): Promise<Response> {
  const parsed = parseJsonRpc(raw);
  if (!parsed.ok) {
    return json(jsonRpcError(null, parsed.code, parsed.message), 400);
  }
  const request = parsed.request;

  // server/discover is the negotiation itself, so it precedes authentication.
  if (isPublicMethod(request.method)) {
    // A notification is unanswerable whichever side of authentication it
    // arrives on. Checking only on the authenticated path left the public one
    // replying to a request JSON-RPC says has no reply.
    if (isNotification(request)) return new Response(null, { status: 202 });

    const outcome = dispatchPublic(request);
    return outcome.kind === 'result'
      ? json(jsonRpcResult(request.id, outcome.result))
      : json(jsonRpcError(request.id, outcome.code, outcome.message));
  }

  const auth = await authenticateConnectorRequest(req);
  if (!auth.ok) {
    // The 401 and its WWW-Authenticate header are what tell Claude where the
    // authorization server is. A JSON-RPC error with status 200 would leave it
    // with nowhere to go — the single most common way this integration fails
    // silently.
    return auth.response;
  }

  // A notification has no id and must not be answered. Dispatch still runs, so
  // lifecycle notifications reach anything that cares, but the reply is empty.
  if (isNotification(request)) {
    await dispatchAuthenticated(request, auth.identity).catch(() => undefined);
    return new Response(null, { status: 202 });
  }

  try {
    const outcome = await dispatchAuthenticated(request, auth.identity);
    if (outcome.kind === 'result') return json(jsonRpcResult(request.id, outcome.result));
    return json(jsonRpcError(request.id, outcome.code, outcome.message));
  } catch (error) {
    // The message is deliberately generic. Handler errors can carry query text
    // or row contents, and this response crosses a trust boundary.
    console.error('[connector] dispatch failed', {
      method: request.method,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return json(jsonRpcError(request.id, JSONRPC.INTERNAL_ERROR, 'Internal error'));
  }
}
