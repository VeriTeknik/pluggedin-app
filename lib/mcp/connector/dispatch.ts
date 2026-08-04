/**
 * Method → handler routing for the hosted connector.
 *
 * Two things are load-bearing here and easy to get subtly wrong:
 *
 * `server/discover` answers *before* authentication, because it is the
 * negotiation — a client that cannot discover what we speak has no route to
 * authenticating. It carries no user data.
 *
 * Every other method authenticates first, and `tools/call` additionally checks
 * the tool's required scope against the token. The scope check is a second gate
 * behind consent, not a duplicate of it: a token issued before a tool existed
 * holds no scope for it, and must not gain one by the tool shipping.
 */

import type { ConnectorIdentity } from '@/lib/oauth/provider/authenticate';

import { listHubs, openHub, type ToolResult } from './handlers/hubs';
import {
  buildDiscoverResult,
  buildInitializeResult,
  JSONRPC,
  type JsonRpcRequest,
} from './protocol';
import { findTool, requiredScopeFor, visibleTools } from './tools';

export type DispatchOutcome =
  | { kind: 'result'; result: unknown }
  | { kind: 'error'; code: number; message: string };

/** Methods answerable without a token. */
export function isPublicMethod(method: string): boolean {
  return method === 'server/discover';
}

export function dispatchPublic(request: JsonRpcRequest): DispatchOutcome {
  if (request.method === 'server/discover') {
    return { kind: 'result', result: buildDiscoverResult() };
  }
  return { kind: 'error', code: JSONRPC.METHOD_NOT_FOUND, message: `Unknown method: ${request.method}` };
}

const TOOL_HANDLERS: Record<
  string,
  (identity: ConnectorIdentity, params: Record<string, unknown>) => Promise<ToolResult>
> = {
  pluggedin_list_hubs: (identity) => listHubs(identity),
  pluggedin_open_hub: (identity, params) => openHub(identity, params),
};

export async function dispatchAuthenticated(
  request: JsonRpcRequest,
  identity: ConnectorIdentity
): Promise<DispatchOutcome> {
  switch (request.method) {
    case 'initialize': {
      const requested = request.params?.protocolVersion;
      return {
        kind: 'result',
        result: buildInitializeResult(typeof requested === 'string' ? requested : undefined),
      };
    }

    case 'ping':
      return { kind: 'result', result: {} };

    case 'tools/list':
      return { kind: 'result', result: { tools: visibleTools(identity.scopes) } };

    case 'tools/call': {
      const name = request.params?.name;
      if (typeof name !== 'string') {
        return { kind: 'error', code: JSONRPC.INVALID_PARAMS, message: 'params.name is required' };
      }

      const definition = findTool(name);
      const required = requiredScopeFor(name);
      const handler = TOOL_HANDLERS[name];

      // All three must agree. A tool defined but unmapped, or mapped but
      // scopeless, is a wiring mistake — and answering "unknown tool" for it is
      // better than reaching a handler no scope guards.
      if (!definition || !required || !handler) {
        return { kind: 'error', code: JSONRPC.METHOD_NOT_FOUND, message: `Unknown tool: ${name}` };
      }

      if (!identity.scopes.includes(required)) {
        // Reported as a tool error rather than a transport 403: the call
        // reached a real tool and was refused on authorization, and Claude
        // surfaces that to the user instead of treating the connection as
        // broken.
        return {
          kind: 'result',
          result: {
            content: [
              {
                type: 'text',
                text: `This connection was not granted the "${required}" scope, which ${name} requires. Re-authorize to grant it.`,
              },
            ],
            isError: true,
          },
        };
      }

      const args =
        request.params?.arguments && typeof request.params.arguments === 'object'
          ? (request.params.arguments as Record<string, unknown>)
          : {};

      return { kind: 'result', result: await handler(identity, args) };
    }

    default:
      return {
        kind: 'error',
        code: JSONRPC.METHOD_NOT_FOUND,
        message: `Unknown method: ${request.method}`,
      };
  }
}
