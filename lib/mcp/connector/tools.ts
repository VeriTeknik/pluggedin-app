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
  {
    name: 'pluggedin_list_documents',
    title: 'List documents in a Hub',
    description:
      'List the documents stored in a Plugged.in Hub. Returns each document with an id to pass to pluggedin_get_document.',
    inputSchema: {
      type: 'object',
      properties: {
        hub: {
          type: 'string',
          description:
            'Optional. Hub name or handle from pluggedin_list_hubs. Defaults to the open Hub, or the only Hub if there is one.',
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'pluggedin_get_document',
    title: 'Get a document',
    description:
      'Fetch one document from a Plugged.in Hub by the id returned from pluggedin_list_documents.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Document id.' },
        hub: {
          type: 'string',
          description:
            'Optional. Hub name or handle from pluggedin_list_hubs. Defaults to the open Hub, or the only Hub if there is one.',
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'pluggedin_ask_knowledge_base',
    title: 'Ask the Hub knowledge base',
    description:
      "Ask a question answered from the documents in a Plugged.in Hub, with the sources it drew on. Use this instead of listing and reading documents when the user asks something the Hub's contents would answer.",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The question to answer.' },
        hub: {
          type: 'string',
          description:
            'Optional. Hub name or handle from pluggedin_list_hubs. Defaults to the open Hub, or the only Hub if there is one.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false },
  },
  {
    name: 'pluggedin_list_notifications',
    title: 'List tasks and notifications',
    description:
      'List the tasks and notifications in a Plugged.in Hub. Set onlyOpen to see just the ones still needing attention. Returns each with an id for the other task tools.',
    inputSchema: {
      type: 'object',
      properties: {
        onlyOpen: { type: 'boolean', description: 'Only those not yet read.' },
        hub: {
          type: 'string',
          description:
            'Optional. Hub name or handle from pluggedin_list_hubs. Defaults to the open Hub, or the only Hub if there is one.',
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'pluggedin_mark_notification_done',
    title: 'Mark a task done',
    description:
      'Mark one task in a Plugged.in Hub as completed, by the id from pluggedin_list_notifications.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task id.' },
        hub: {
          type: 'string',
          description:
            'Optional. Hub name or handle from pluggedin_list_hubs. Defaults to the open Hub, or the only Hub if there is one.',
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
    // Changes state but loses nothing. Not idempotent: the underlying action
    // toggles, so calling it twice puts the task back.
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: 'pluggedin_delete_notification',
    title: 'Delete a task',
    description: 'Permanently delete one task from a Plugged.in Hub. This cannot be undone.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task id.' },
        hub: {
          type: 'string',
          description:
            'Optional. Hub name or handle from pluggedin_list_hubs. Defaults to the open Hub, or the only Hub if there is one.',
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
    // The only destructive tool in the surface so far, and marked as such:
    // Anthropic's directory rules require the hint, and a model treats a
    // destructive tool differently.
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
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
