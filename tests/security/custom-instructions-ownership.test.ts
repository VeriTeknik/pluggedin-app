import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string } },
  serverRead: vi.fn(),
  instructionRead: vi.fn(),
  write: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ getAuthSession: async () => state.session }));
vi.mock('next/headers', () => ({ cookies: async () => ({ delete: vi.fn() }) }));
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('NEXT_REDIRECT'); } }));
vi.mock('@/db', () => ({ db: {
  query: {
    users: { findFirst: async () => ({ id: state.session?.user.id }) },
    mcpServersTable: { findFirst: state.serverRead },
    customInstructionsTable: { findFirst: state.instructionRead },
  },
  select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({
    limit: async () => [{ profile: { uuid: 'victim-profile' }, project: { user_id: 'owner' } }],
  }) }) }) }),
  insert: () => ({ values: () => ({ onConflictDoUpdate: state.write }) }),
} }));
import { getCustomInstructionsForServer, upsertCustomInstructions } from '@/app/actions/custom-instructions';

beforeEach(() => {
  vi.clearAllMocks();
  state.serverRead.mockResolvedValue({ uuid: 'victim-server' });
  state.instructionRead.mockResolvedValue({ messages: ['private instructions'] });
  state.write.mockResolvedValue(undefined);
});

describe('custom instructions are scoped to the session owner', () => {
  for (const caller of [null, 'attacker', 'owner']) {
    it(`checks read and write ownership for ${caller ?? 'anonymous'}`, async () => {
      state.session = caller ? { user: { id: caller } } : null;
      const read = await getCustomInstructionsForServer('victim-profile', 'victim-server');
      const write = await upsertCustomInstructions('victim-profile', 'victim-server', []);
      if (caller === 'owner') {
        expect(read).toEqual({ messages: ['private instructions'] });
        expect(write.success).toBe(true);
        expect(state.write).toHaveBeenCalledOnce();
      } else {
        expect.soft(read).toBeNull();
        expect.soft(write.success).toBe(false);
        expect(state.serverRead).not.toHaveBeenCalled();
        expect(state.instructionRead).not.toHaveBeenCalled();
        expect(state.write).not.toHaveBeenCalled();
      }
    });
  }
});
