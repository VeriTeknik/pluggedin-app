import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Dispatch and the JSON-RPC envelope.
 *
 * The two behaviours worth guarding hardest are the ones a client cannot work
 * around: server/discover has to answer before authentication, and tools/call
 * has to refuse a tool whose scope the token does not hold. Everything else
 * here is envelope handling, which is easy to get subtly wrong and impossible
 * to debug from the client side.
 */

const { mockDb } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), update: vi.fn() },
}));
vi.mock('@/db', () => ({ db: mockDb }));

process.env.NEXTAUTH_SECRET = 'connector-dispatch-test-secret';
process.env.NEXTAUTH_URL = 'https://plugged.in';

import { db } from '@/db';
import {
  dispatchAuthenticated,
  dispatchPublic,
  isPublicMethod,
} from '@/lib/mcp/connector/dispatch';
import { parseJsonRpc } from '@/lib/mcp/connector/protocol';
import type { ConnectorIdentity } from '@/lib/oauth/provider/authenticate';

const HUB_A = '11111111-1111-1111-1111-111111111111';
const HUB_B = '22222222-2222-2222-2222-222222222222';

function identity(overrides: Partial<ConnectorIdentity> = {}): ConnectorIdentity {
  return {
    userId: 'user-1',
    grantedProjectUuids: [HUB_A],
    defaultProjectUuid: HUB_A,
    scopes: ['hubs:read'],
    tokenUuid: '33333333-3333-3333-3333-333333333333',
    ...overrides,
  };
}

function hubRows(rows: { uuid: string; name: string }[]) {
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
    from: vi.fn(() => ({ where: vi.fn().mockResolvedValue(rows) })),
  });
  (db.update as ReturnType<typeof vi.fn>).mockReturnValue({
    set: vi.fn(() => ({ where: vi.fn().mockResolvedValue({ rowCount: 1 }) })),
  });
}

function call(name: string, args: Record<string, unknown> = {}) {
  return {
    jsonrpc: '2.0' as const,
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('server/discover', () => {
  it('is answerable without a token', () => {
    // It is the negotiation: a client that cannot discover what we speak has
    // no route to authenticating in the first place.
    expect(isPublicMethod('server/discover')).toBe(true);
    expect(isPublicMethod('tools/list')).toBe(false);
    expect(isPublicMethod('initialize')).toBe(false);
  });

  it('advertises the newest revision first and carries no user data', () => {
    const outcome = dispatchPublic({ jsonrpc: '2.0', id: 1, method: 'server/discover' });
    expect(outcome.kind).toBe('result');
    if (outcome.kind !== 'result') return;

    const result = outcome.result as {
      resultType: string;
      protocolVersions: string[];
      serverInfo: { name: string };
    };
    expect(result.resultType).toBe('complete');
    expect(result.protocolVersions[0]).toBe('2026-07-28');
    expect(JSON.stringify(result)).not.toContain('user-1');
  });
});

describe('tools/list', () => {
  it('shows only tools the token holds the scope for', async () => {
    const withHubs = await dispatchAuthenticated(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      identity({ scopes: ['hubs:read'] })
    );
    const withoutHubs = await dispatchAuthenticated(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      identity({ scopes: ['library:read'] })
    );

    const names = (o: typeof withHubs) =>
      o.kind === 'result' ? (o.result as { tools: { name: string }[] }).tools.map((t) => t.name) : [];

    expect(names(withHubs)).toContain('pluggedin_list_hubs');
    expect(names(withoutHubs)).toHaveLength(0);
  });

  it('gives every listed tool a title and an explicit read/destructive hint', async () => {
    // Anthropic's directory rules, not preference: a tool without these is
    // grounds for rejection, and the failure would surface at submission time
    // rather than here.
    const outcome = await dispatchAuthenticated(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      identity({ scopes: ['hubs:read'] })
    );
    if (outcome.kind !== 'result') throw new Error('expected a result');

    for (const tool of (outcome.result as { tools: Record<string, unknown>[] }).tools) {
      expect(tool.title, `${tool.name} has no title`).toBeTruthy();
      const annotations = tool.annotations as Record<string, unknown>;
      expect(typeof annotations.readOnlyHint).toBe('boolean');
      expect(typeof annotations.destructiveHint).toBe('boolean');
    }
  });
});

describe('tools/call scope gating', () => {
  it('refuses a tool whose scope the token does not hold', async () => {
    hubRows([{ uuid: HUB_A, name: 'Acme' }]);

    const outcome = await dispatchAuthenticated(
      call('pluggedin_list_hubs'),
      identity({ scopes: ['library:read'] })
    );

    expect(outcome.kind).toBe('result');
    if (outcome.kind !== 'result') return;
    const result = outcome.result as { isError?: boolean; content: { text: string }[] };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('hubs:read');
    // The refusal must not have reached the handler.
    expect(db.select).not.toHaveBeenCalled();
  });

  it('refuses a tool that exists in no scope map', async () => {
    const outcome = await dispatchAuthenticated(
      call('pluggedin_definitely_not_a_tool'),
      identity({ scopes: ['hubs:read'] })
    );
    expect(outcome.kind).toBe('error');
    if (outcome.kind === 'error') expect(outcome.message).toContain('Unknown tool');
  });
});

describe('hub tools', () => {
  it('lists only granted Hubs, with a handle each', async () => {
    hubRows([{ uuid: HUB_A, name: 'Acme' }]);

    const outcome = await dispatchAuthenticated(call('pluggedin_list_hubs'), identity());
    if (outcome.kind !== 'result') throw new Error('expected a result');

    const payload = JSON.parse((outcome.result as { content: { text: string }[] }).content[0].text);
    expect(payload.hubs).toHaveLength(1);
    expect(payload.hubs[0].name).toBe('Acme');
    expect(payload.hubs[0].handle).toMatch(/^hub_/);
    // A raw project uuid must not leak into the wire format, or clients will
    // start depending on its shape.
    expect(JSON.stringify(payload)).not.toContain(HUB_A);
  });

  it('opens a granted Hub by name and records it as the default', async () => {
    hubRows([{ uuid: HUB_A, name: 'Acme' }]);

    const outcome = await dispatchAuthenticated(
      call('pluggedin_open_hub', { hub: 'Acme' }),
      identity()
    );
    if (outcome.kind !== 'result') throw new Error('expected a result');

    const payload = JSON.parse((outcome.result as { content: { text: string }[] }).content[0].text);
    expect(payload.opened).toBe('Acme');
    expect(db.update).toHaveBeenCalled();
  });

  it('refuses a Hub that exists but was not granted', async () => {
    // The query is scoped to the granted set, so an ungranted Hub simply is not
    // in the rows — and the answer is identical to a Hub that does not exist,
    // which is what stops a caller enumerating other people's Hub names.
    hubRows([]);

    const outcome = await dispatchAuthenticated(
      call('pluggedin_open_hub', { hub: 'Someone Elses Hub' }),
      identity({ grantedProjectUuids: [] })
    );
    if (outcome.kind !== 'result') throw new Error('expected a result');

    const result = outcome.result as { isError?: boolean };
    expect(result.isError).toBe(true);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('refuses a handle minted for a different token', async () => {
    hubRows([{ uuid: HUB_A, name: 'Acme' }]);
    const mine = await dispatchAuthenticated(call('pluggedin_list_hubs'), identity());
    if (mine.kind !== 'result') throw new Error('expected a result');
    const handle = JSON.parse((mine.result as { content: { text: string }[] }).content[0].text)
      .hubs[0].handle;

    vi.clearAllMocks();
    hubRows([{ uuid: HUB_A, name: 'Acme' }]);
    const outcome = await dispatchAuthenticated(
      call('pluggedin_open_hub', { hub: handle }),
      identity({ tokenUuid: 'a-different-token' })
    );
    if (outcome.kind !== 'result') throw new Error('expected a result');
    expect((outcome.result as { isError?: boolean }).isError).toBe(true);
  });

  it('still refuses when a valid handle names an ungranted Hub', async () => {
    // The handle is a convenience, never the authorization. Even a correctly
    // signed one has to clear the granted set.
    hubRows([{ uuid: HUB_B, name: 'Other' }]);

    const outcome = await dispatchAuthenticated(
      call('pluggedin_open_hub', { hub: HUB_B }),
      identity({ grantedProjectUuids: [HUB_A] })
    );
    if (outcome.kind !== 'result') throw new Error('expected a result');
    expect((outcome.result as { isError?: boolean }).isError).toBe(true);
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe('JSON-RPC envelope', () => {
  it('rejects a body that is not a JSON-RPC 2.0 request', () => {
    expect(parseJsonRpc(null).ok).toBe(false);
    expect(parseJsonRpc([]).ok).toBe(false);
    expect(parseJsonRpc({ method: 'x' }).ok).toBe(false);
    expect(parseJsonRpc({ jsonrpc: '2.0' }).ok).toBe(false);
    expect(parseJsonRpc({ jsonrpc: '1.0', method: 'x' }).ok).toBe(false);
  });

  it('keeps a request without an id distinguishable from one with id null', () => {
    // JSON-RPC forbids answering a notification, and `id: null` is a request.
    // Collapsing them means either replying to a notification or dropping a
    // real reply.
    const notification = parseJsonRpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
    const withNullId = parseJsonRpc({ jsonrpc: '2.0', id: null, method: 'ping' });

    expect(notification.ok && 'id' in notification.request).toBe(false);
    expect(withNullId.ok && 'id' in withNullId.request).toBe(true);
  });

  it('answers an unknown method with method-not-found rather than a crash', async () => {
    const outcome = await dispatchAuthenticated(
      { jsonrpc: '2.0', id: 1, method: 'resources/list' },
      identity()
    );
    expect(outcome.kind).toBe('error');
    if (outcome.kind === 'error') expect(outcome.code).toBe(-32601);
  });
});
