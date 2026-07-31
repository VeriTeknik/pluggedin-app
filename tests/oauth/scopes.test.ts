import { describe, expect, it } from 'vitest';
import {
  SUPPORTED_SCOPES,
  TOOL_SCOPES,
  hasScope,
  parseScopeParam,
} from '@/lib/oauth/scopes';

describe('supported scopes', () => {
  it('mirrors the read/write split the directory requires in annotations', () => {
    expect([...SUPPORTED_SCOPES].sort()).toEqual([
      'clipboard:read',
      'clipboard:write',
      'hubs:read',
      'library:read',
      'library:write',
      'memory:read',
      'memory:write',
      'offline_access',
      'tasks:read',
      'tasks:write',
    ]);
  });

  it('includes offline_access so Claude can obtain a refresh token', () => {
    expect(SUPPORTED_SCOPES).toContain('offline_access');
  });
});

describe('parsing the scope parameter', () => {
  it('splits on whitespace and drops unknown scopes', () => {
    expect(parseScopeParam('library:read memory:read bogus:scope')).toEqual([
      'library:read',
      'memory:read',
    ]);
  });

  it('collapses duplicates and tolerates irregular whitespace', () => {
    expect(parseScopeParam('  library:read   library:read\tmemory:read ')).toEqual([
      'library:read',
      'memory:read',
    ]);
  });

  it('returns an empty array for null or empty input', () => {
    expect(parseScopeParam(null)).toEqual([]);
    expect(parseScopeParam('')).toEqual([]);
  });
});

describe('enforcement', () => {
  it('grants only what was granted', () => {
    expect(hasScope(['library:read'], 'library:read')).toBe(true);
    expect(hasScope(['library:read'], 'library:write')).toBe(false);
  });

  it('does not treat write as implying read', () => {
    // Implied hierarchies are a classic source of over-broad grants; keep them
    // explicit so the consent screen and the enforcement agree exactly.
    expect(hasScope(['library:write'], 'library:read')).toBe(false);
  });
});

describe('tool to scope mapping', () => {
  it('maps every read tool to a :read scope and every write tool to :write', () => {
    expect(TOOL_SCOPES['pluggedin_search_documents']).toBe('library:read');
    expect(TOOL_SCOPES['pluggedin_create_document']).toBe('library:write');
    expect(TOOL_SCOPES['pluggedin_clipboard_get']).toBe('clipboard:read');
    expect(TOOL_SCOPES['pluggedin_clipboard_set']).toBe('clipboard:write');
    expect(TOOL_SCOPES['pluggedin_list_notifications']).toBe('tasks:read');
    expect(TOOL_SCOPES['pluggedin_send_notification']).toBe('tasks:write');
    expect(TOOL_SCOPES['pluggedin_memory_search']).toBe('memory:read');
    expect(TOOL_SCOPES['pluggedin_memory_observe']).toBe('memory:write');
    expect(TOOL_SCOPES['pluggedin_record_finding']).toBe('memory:write');
    expect(TOOL_SCOPES['pluggedin_list_hubs']).toBe('hubs:read');
  });

  it('has no entry for a tool that does not exist, so the dispatcher fails closed', () => {
    expect(TOOL_SCOPES['pluggedin_not_a_real_tool']).toBeUndefined();
  });
});
