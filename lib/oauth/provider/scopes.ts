/**
 * OAuth scopes for the hosted MCP connector.
 *
 * Deliberately mirrors the read/write split the directory requires in tool
 * annotations, so the consent screen and the tool list tell the same story: a
 * tool marked readOnlyHint needs a :read scope, a tool that writes needs :write.
 *
 * There is no implied hierarchy — :write does not grant :read. Implied
 * hierarchies quietly widen grants and make the consent screen a lie.
 */

export type Scope =
  | 'library:read'
  | 'library:write'
  | 'memory:read'
  | 'memory:write'
  | 'clipboard:read'
  | 'clipboard:write'
  | 'tasks:read'
  | 'tasks:write'
  | 'hubs:read'
  | 'offline_access';

export const SUPPORTED_SCOPES: readonly Scope[] = [
  'library:read',
  'library:write',
  'memory:read',
  'memory:write',
  'clipboard:read',
  'clipboard:write',
  'tasks:read',
  'tasks:write',
  'hubs:read',
  'offline_access',
] as const;

const SCOPE_SET = new Set<string>(SUPPORTED_SCOPES);

export function parseScopeParam(raw: string | null): Scope[] {
  if (!raw) return [];
  const seen = new Set<Scope>();
  for (const token of raw.split(/\s+/)) {
    if (SCOPE_SET.has(token)) seen.add(token as Scope);
  }
  return [...seen];
}

export function hasScope(granted: string[], required: Scope): boolean {
  return granted.includes(required);
}

/**
 * Tool name to required scope.
 *
 * A tool absent from this map is refused rather than allowed — see the
 * dispatcher in Phase B. Fail closed: forgetting to add a new tool here must
 * not silently expose it.
 */
export const TOOL_SCOPES: Readonly<Record<string, Scope>> = Object.freeze({
  // Hubs
  pluggedin_list_hubs: 'hubs:read',
  pluggedin_open_hub: 'hubs:read',

  // Library
  pluggedin_ask_knowledge_base: 'library:read',
  pluggedin_get_document: 'library:read',
  pluggedin_list_documents: 'library:read',
  pluggedin_search_documents: 'library:read',
  pluggedin_create_document: 'library:write',
  pluggedin_update_document: 'library:write',

  // Clipboard
  pluggedin_clipboard_get: 'clipboard:read',
  pluggedin_clipboard_list: 'clipboard:read',
  pluggedin_clipboard_set: 'clipboard:write',
  pluggedin_clipboard_push: 'clipboard:write',
  pluggedin_clipboard_pop: 'clipboard:write',
  pluggedin_clipboard_delete: 'clipboard:write',

  // Tasks (notifications)
  pluggedin_list_notifications: 'tasks:read',
  pluggedin_send_notification: 'tasks:write',
  pluggedin_mark_notification_done: 'tasks:write',
  pluggedin_delete_notification: 'tasks:write',

  // Memory
  pluggedin_memory_search: 'memory:read',
  pluggedin_memory_details: 'memory:read',
  pluggedin_memory_search_with_context: 'memory:read',
  pluggedin_memory_individuation: 'memory:read',
  pluggedin_memory_session_start: 'memory:write',
  pluggedin_memory_session_end: 'memory:write',
  pluggedin_memory_observe: 'memory:write',
  pluggedin_record_finding: 'memory:write',
});
