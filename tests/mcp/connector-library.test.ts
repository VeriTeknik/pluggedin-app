import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Library tools, and the Hub boundary they run behind.
 *
 * The shared actions take `projectUuid?: string` and fall back to every
 * document the *user* owns when it is absent. That is fine for the web UI,
 * whose boundary is the user; it is a silent widening here, whose boundary is
 * the Hub set granted at consent. The failure has no symptom — the wrong
 * documents come back and the call looks like it worked — so these tests assert
 * on what reached the action, not only on what came out.
 */

const { mockDb, actions } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), update: vi.fn() },
  actions: {
    getDocs: vi.fn(),
    getDocByUuid: vi.fn(),
    askKnowledgeBase: vi.fn(),
  },
}));

vi.mock('@/db', () => ({ db: mockDb }));
vi.mock('@/app/actions/library', () => actions);

process.env.NEXTAUTH_SECRET = 'connector-library-test-secret';
process.env.NEXTAUTH_URL = 'https://plugged.in';

import { db } from '@/db';
import { dispatchAuthenticated } from '@/lib/mcp/connector/dispatch';
import { mintHubHandle } from '@/lib/mcp/connector/handles';
import type { ConnectorIdentity } from '@/lib/oauth/provider/authenticate';

const HUB_A = '11111111-1111-1111-1111-111111111111';
const HUB_B = '22222222-2222-2222-2222-222222222222';
const TOKEN = '33333333-3333-3333-3333-333333333333';

function identity(overrides: Partial<ConnectorIdentity> = {}): ConnectorIdentity {
  return {
    userId: 'user-1',
    grantedProjectUuids: [HUB_A],
    defaultProjectUuid: HUB_A,
    scopes: ['library:read'],
    tokenUuid: TOKEN,
    ...overrides,
  };
}

/** Rows the granted-Hub query returns. Bounded by the granted set in the real query. */
function grantedHubs(rows: { uuid: string; name: string }[]) {
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
    from: vi.fn(() => ({ where: vi.fn().mockResolvedValue(rows) })),
  });
}

function call(name: string, args: Record<string, unknown> = {}) {
  return { jsonrpc: '2.0' as const, id: 1, method: 'tools/call', params: { name, arguments: args } };
}

function payloadOf(outcome: Awaited<ReturnType<typeof dispatchAuthenticated>>) {
  if (outcome.kind !== 'result') throw new Error('expected a result');
  const result = outcome.result as { isError?: boolean; content: { text: string }[] };
  return { isError: result.isError, text: result.content[0].text };
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.getDocs.mockResolvedValue({ success: true, docs: [] });
  actions.getDocByUuid.mockResolvedValue(null);
  actions.askKnowledgeBase.mockResolvedValue({ success: true, answer: 'because', sources: [] });
});

describe('the Hub always reaches the action', () => {
  it('passes the resolved Hub to getDocs', async () => {
    grantedHubs([{ uuid: HUB_A, name: 'Acme' }]);

    await dispatchAuthenticated(call('pluggedin_list_documents'), identity());

    // The second argument is what stops the action falling back to every
    // document the user owns. Asserting only on the output would pass while
    // that fallback ran.
    expect(actions.getDocs).toHaveBeenCalledWith('user-1', HUB_A);
  });

  it('passes it to getDocByUuid and to askKnowledgeBase too', async () => {
    grantedHubs([{ uuid: HUB_A, name: 'Acme' }]);

    await dispatchAuthenticated(call('pluggedin_get_document', { id: 'doc-1' }), identity());
    expect(actions.getDocByUuid).toHaveBeenCalledWith('user-1', 'doc-1', HUB_A);

    await dispatchAuthenticated(call('pluggedin_ask_knowledge_base', { query: 'why' }), identity());
    expect(actions.askKnowledgeBase).toHaveBeenCalledWith('user-1', 'why', HUB_A);
  });

  it('never calls an action when no Hub could be resolved', async () => {
    grantedHubs([]);

    const result = payloadOf(
      await dispatchAuthenticated(
        call('pluggedin_list_documents'),
        identity({ grantedProjectUuids: [], defaultProjectUuid: null })
      )
    );

    expect(result.isError).toBe(true);
    expect(actions.getDocs).not.toHaveBeenCalled();
  });

  it('refuses an ungranted Hub named explicitly', async () => {
    // The query is bounded by the granted set, so an ungranted Hub is simply
    // not among the rows.
    grantedHubs([{ uuid: HUB_A, name: 'Acme' }]);

    const result = payloadOf(
      await dispatchAuthenticated(
        call('pluggedin_list_documents', { hub: 'Someone Elses Hub' }),
        identity()
      )
    );

    expect(result.isError).toBe(true);
    expect(actions.getDocs).not.toHaveBeenCalled();
  });

  it('refuses a handle minted for another token', async () => {
    grantedHubs([{ uuid: HUB_A, name: 'Acme' }]);
    const foreign = mintHubHandle('a-different-token', HUB_A);

    const result = payloadOf(
      await dispatchAuthenticated(call('pluggedin_list_documents', { hub: foreign }), identity())
    );

    expect(result.isError).toBe(true);
    expect(actions.getDocs).not.toHaveBeenCalled();
  });
});

describe('choosing the Hub', () => {
  it('uses the remembered default when nothing is named', async () => {
    grantedHubs([
      { uuid: HUB_A, name: 'Acme' },
      { uuid: HUB_B, name: 'Beta' },
    ]);

    await dispatchAuthenticated(
      call('pluggedin_list_documents'),
      identity({ grantedProjectUuids: [HUB_A, HUB_B], defaultProjectUuid: HUB_B })
    );

    expect(actions.getDocs).toHaveBeenCalledWith('user-1', HUB_B);
  });

  it('ignores a remembered default that is no longer granted', async () => {
    // Re-authorizing with a narrower selection leaves the column pointing at a
    // Hub the token may no longer read.
    grantedHubs([{ uuid: HUB_A, name: 'Acme' }]);

    await dispatchAuthenticated(
      call('pluggedin_list_documents'),
      identity({ grantedProjectUuids: [HUB_A], defaultProjectUuid: HUB_B })
    );

    expect(actions.getDocs).toHaveBeenCalledWith('user-1', HUB_A);
  });

  it('asks rather than guessing when several are granted and none is open', async () => {
    grantedHubs([
      { uuid: HUB_A, name: 'Acme' },
      { uuid: HUB_B, name: 'Beta' },
    ]);

    const result = payloadOf(
      await dispatchAuthenticated(
        call('pluggedin_list_documents'),
        identity({ grantedProjectUuids: [HUB_A, HUB_B], defaultProjectUuid: null })
      )
    );

    // Picking one would put a user's documents in front of a model they did
    // not point at them.
    expect(result.isError).toBe(true);
    expect(result.text).toContain('pluggedin_open_hub');
    expect(actions.getDocs).not.toHaveBeenCalled();
  });
});

describe('what is handed to the model', () => {
  it('reports documents without file paths or internal ids', async () => {
    grantedHubs([{ uuid: HUB_A, name: 'Acme' }]);
    actions.getDocs.mockResolvedValue({
      success: true,
      docs: [
        {
          uuid: 'doc-1',
          user_id: 'user-1',
          profile_uuid: 'profile-secret',
          name: 'Notes',
          description: null,
          file_name: 'notes.md',
          file_size: 12,
          mime_type: 'text/markdown',
          file_path: '/srv/uploads/user-1/notes.md',
          rag_document_id: 'rag-secret',
          source: 'upload',
        },
      ],
    });

    const result = payloadOf(
      await dispatchAuthenticated(call('pluggedin_list_documents'), identity())
    );

    expect(result.text).toContain('Notes');
    // Everything sent crosses a trust boundary, and a model has no use for any
    // of these.
    expect(result.text).not.toContain('/srv/uploads');
    expect(result.text).not.toContain('profile-secret');
    expect(result.text).not.toContain('rag-secret');
  });

  it('answers a missing document the same way as an unreadable one', async () => {
    grantedHubs([{ uuid: HUB_A, name: 'Acme' }]);
    actions.getDocByUuid.mockResolvedValue(null);

    const result = payloadOf(
      await dispatchAuthenticated(call('pluggedin_get_document', { id: 'nope' }), identity())
    );

    expect(result.isError).toBe(true);
    // Distinguishing them would confirm the existence of documents the caller
    // may not read.
    expect(result.text).toContain('No document');
  });
});

describe('grants that outlived their Hubs', () => {
  it('says the Hubs are gone rather than telling the user to open one', async () => {
    // A Hub deleted after consent leaves its uuid on the token, so the granted
    // set is non-empty while the query returns nothing. The fallthrough used to
    // answer "several Hubs are available, open one" — false, since none are,
    // and it pointed at a tool that would fail the same way. A wrong message
    // recommending a dead end is worse than no message.
    grantedHubs([]);

    const result = payloadOf(
      await dispatchAuthenticated(
        call('pluggedin_list_documents'),
        identity({ grantedProjectUuids: [HUB_A], defaultProjectUuid: HUB_A })
      )
    );

    expect(result.isError).toBe(true);
    expect(result.text).toContain('no longer exist');
    expect(result.text).not.toContain('pluggedin_open_hub');
    expect(actions.getDocs).not.toHaveBeenCalled();
  });
});
