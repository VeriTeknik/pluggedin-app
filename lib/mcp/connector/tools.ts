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
    const required = requiredScopeFor(tool.name);
    return required !== undefined && grantedScopes.includes(required);
  });
}

/**
 * Own properties only. TOOL_SCOPES is an object literal, so it inherits from
 * Object.prototype and a plain lookup answers for names nobody defined:
 * requiredScopeFor('constructor') returns a *function*, which is truthy.
 *
 * Nothing was exploitable — findTool scans an array by name equality and no
 * prototype key survives it, so the call never reached a handler. But that made
 * the safety incidental rather than stated: the redundant-looking `definition`
 * check in dispatch was the only thing standing between an attacker-supplied
 * tool name and a truthy handler. A later cleanup removing it as duplicated
 * would have opened the path silently.
 */
export function requiredScopeFor(toolName: string): Scope | undefined {
  return Object.hasOwn(TOOL_SCOPES, toolName) ? TOOL_SCOPES[toolName] : undefined;
}

export function findTool(toolName: string): ToolDefinition | undefined {
  return TOOLS.find((tool) => tool.name === toolName);
}
