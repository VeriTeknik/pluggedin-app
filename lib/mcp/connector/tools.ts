/**
 * The tool surface Claude sees.
 *
 * Anthropic's directory rules shape these definitions, not preference: every
 * tool carries a `title` and an explicit read/destructive annotation, and read
 * and write are separate tools rather than one call with a mode argument. A
 * catch-all `api_request` is grounds for rejection.
 *
 * Each entry must also appear in TOOL_SCOPES. That map is the authorization
 * decision and it fails closed, so a tool added here without a scope is not
 * callable — the check below turns that from a silent hole into a startup-time
 * inconsistency the tests catch.
 */

import { TOOL_SCOPES } from '@/lib/oauth/provider/scopes';
import type { Scope } from '@/lib/oauth/provider/scopes';

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint?: boolean;
  };
}

export const TOOLS: readonly ToolDefinition[] = Object.freeze([
  {
    name: 'pluggedin_list_hubs',
    title: 'List Plugged.in Hubs',
    description:
      'List the Plugged.in Hubs this connection may reach. Returns each Hub with a handle to pass to other tools. Call this first when the user has more than one Hub.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'pluggedin_open_hub',
    title: 'Open a Plugged.in Hub',
    description:
      'Select the Hub for subsequent calls, by name or by a handle from pluggedin_list_hubs. Only Hubs granted when the connection was authorized can be opened.',
    inputSchema: {
      type: 'object',
      properties: {
        hub: {
          type: 'string',
          description: 'Hub name, or a handle returned by pluggedin_list_hubs.',
        },
      },
      required: ['hub'],
      additionalProperties: false,
    },
    // Not read-only: it changes which Hub this token defaults to. Not
    // destructive either — nothing is lost, and the previous choice can be
    // restored by opening the other Hub.
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
]);

/** Tools whose required scope the caller holds. */
export function visibleTools(grantedScopes: string[]): ToolDefinition[] {
  return TOOLS.filter((tool) => {
    const required = TOOL_SCOPES[tool.name];
    return required !== undefined && grantedScopes.includes(required);
  });
}

export function requiredScopeFor(toolName: string): Scope | undefined {
  return TOOL_SCOPES[toolName];
}

export function findTool(toolName: string): ToolDefinition | undefined {
  return TOOLS.find((tool) => tool.name === toolName);
}
