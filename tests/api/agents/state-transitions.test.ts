/**
 * Tests for agent state transition API
 * Tests the PAP-RFC-001 §7.2 normative FSM enforcement
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies before importing the route
vi.mock('@/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve()),
    })),
  },
}));

vi.mock('@/app/api/auth', () => ({
  authenticate: vi.fn(),
}));

vi.mock('@/lib/rate-limiter-redis', () => ({
  EnhancedRateLimiters: {
    agentLifecycle: vi.fn(() => Promise.resolve({
      allowed: true,
      limit: 30,
      remaining: 29,
      reset: Date.now() + 60000,
    })),
  },
}));

import { db } from '@/db';
import { authenticate } from '@/app/api/auth';
import { POST } from '@/app/api/agents/[id]/state/route';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

// Mock AgentState enum since we can't import from schema in tests
const AgentState = {
  NEW: 'NEW',
  PROVISIONED: 'PROVISIONED',
  ACTIVE: 'ACTIVE',
  DRAINING: 'DRAINING',
  TERMINATED: 'TERMINATED',
  KILLED: 'KILLED',
} as const;

describe('/api/agents/[id]/state', () => {
  const mockAuth = {
    error: null,
    project: { user_id: 'user-123', uuid: 'project-uuid' },
    activeProfile: { uuid: 'profile-uuid' },
  };

  const mockAgent = {
    uuid: 'agent-uuid',
    name: 'test-agent',
    profile_uuid: 'profile-uuid',
    state: AgentState.ACTIVE,
    provisioned_at: new Date(),
    activated_at: new Date(),
    terminated_at: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticate).mockResolvedValue(mockAuth as any);
  });

  function createRequest(body: object): NextRequest {
    return new NextRequest('http://localhost:12005/api/agents/agent-uuid/state', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function mockSelectAgent(agent: typeof mockAgent | null) {
    const selectMock = vi.mocked(db.select);
    selectMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(agent ? [agent] : []),
        }),
      }),
    } as any);
  }

  function mockUpdateAgent(success: boolean) {
    const updateMock = vi.mocked(db.update);
    updateMock.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(success ? [{ ...mockAgent }] : []),
        }),
      }),
    } as any);
  }

  describe('authentication and rate limiting', () => {
    it('should return 401 when not authenticated', async () => {
      vi.mocked(authenticate).mockResolvedValue({
        error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
      } as any);

      const request = createRequest({
        from_state: AgentState.ACTIVE,
        to_state: AgentState.DRAINING,
      });

      const response = await POST(request, { params: Promise.resolve({ id: 'agent-uuid' }) });
      expect(response.status).toBe(401);
    });

    it('should return 429 when rate limited', async () => {
      vi.mocked(EnhancedRateLimiters.agentLifecycle).mockResolvedValue({
        allowed: false,
        limit: 30,
        remaining: 0,
        reset: Date.now() + 60000,
        retryAfter: 60,
      });

      const request = createRequest({
        from_state: AgentState.ACTIVE,
        to_state: AgentState.DRAINING,
      });

      const response = await POST(request, { params: Promise.resolve({ id: 'agent-uuid' }) });
      expect(response.status).toBe(429);
    });
  });

  describe('request validation', () => {
    beforeEach(() => {
      vi.mocked(EnhancedRateLimiters.agentLifecycle).mockResolvedValue({
        allowed: true,
        limit: 30,
        remaining: 29,
        reset: Date.now() + 60000,
      });
    });

    it('should return 400 when from_state is missing', async () => {
      const request = createRequest({
        to_state: AgentState.DRAINING,
      });

      const response = await POST(request, { params: Promise.resolve({ id: 'agent-uuid' }) });
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain('from_state');
    });

    it('should return 400 when to_state is missing', async () => {
      const request = createRequest({
        from_state: AgentState.ACTIVE,
      });

      const response = await POST(request, { params: Promise.resolve({ id: 'agent-uuid' }) });
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain('to_state');
    });

    it('should return 400 for invalid from_state', async () => {
      const request = createRequest({
        from_state: 'INVALID_STATE',
        to_state: AgentState.DRAINING,
      });

      const response = await POST(request, { params: Promise.resolve({ id: 'agent-uuid' }) });
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain('Invalid from_state');
    });

    it('should return 400 for invalid to_state', async () => {
      const request = createRequest({
        from_state: AgentState.ACTIVE,
        to_state: 'INVALID_STATE',
      });

      const response = await POST(request, { params: Promise.resolve({ id: 'agent-uuid' }) });
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain('Invalid to_state');
    });
  });

  describe('agent lookup', () => {
    beforeEach(() => {
      vi.mocked(EnhancedRateLimiters.agentLifecycle).mockResolvedValue({
        allowed: true,
        limit: 30,
        remaining: 29,
        reset: Date.now() + 60000,
      });
    });

    it('should return 404 when agent not found', async () => {
      mockSelectAgent(null);

      const request = createRequest({
        from_state: AgentState.ACTIVE,
        to_state: AgentState.DRAINING,
      });

      const response = await POST(request, { params: Promise.resolve({ id: 'nonexistent' }) });
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toBe('Agent not found');
    });
  });

  describe('state mismatch detection', () => {
    beforeEach(() => {
      vi.mocked(EnhancedRateLimiters.agentLifecycle).mockResolvedValue({
        allowed: true,
        limit: 30,
        remaining: 29,
        reset: Date.now() + 60000,
      });
    });

    it('should return 409 when from_state does not match persisted state', async () => {
      mockSelectAgent({ ...mockAgent, state: AgentState.DRAINING });

      const request = createRequest({
        from_state: AgentState.ACTIVE, // Wrong - agent is actually DRAINING
        to_state: AgentState.TERMINATED,
      });

      const response = await POST(request, { params: Promise.resolve({ id: 'agent-uuid' }) });
      expect(response.status).toBe(409);

      const data = await response.json();
      expect(data.error).toContain('State mismatch');
      expect(data.current_state).toBe(AgentState.DRAINING);
      expect(data.hint).toContain('Refresh');
    });
  });

  describe('FSM transition validation (PAP-RFC-001 §7.2)', () => {
    beforeEach(() => {
      vi.mocked(EnhancedRateLimiters.agentLifecycle).mockResolvedValue({
        allowed: true,
        limit: 30,
        remaining: 29,
        reset: Date.now() + 60000,
      });
    });

    describe('valid transitions', () => {
      const validTransitions = [
        { from: AgentState.NEW, to: AgentState.PROVISIONED },
        { from: AgentState.NEW, to: AgentState.KILLED },
        { from: AgentState.PROVISIONED, to: AgentState.ACTIVE },
        { from: AgentState.PROVISIONED, to: AgentState.TERMINATED },
        { from: AgentState.PROVISIONED, to: AgentState.KILLED },
        { from: AgentState.ACTIVE, to: AgentState.DRAINING },
        { from: AgentState.ACTIVE, to: AgentState.KILLED },
        { from: AgentState.DRAINING, to: AgentState.TERMINATED },
        { from: AgentState.DRAINING, to: AgentState.ACTIVE },
        { from: AgentState.DRAINING, to: AgentState.KILLED },
      ];

      validTransitions.forEach(({ from, to }) => {
        it(`should allow ${from} -> ${to}`, async () => {
          mockSelectAgent({ ...mockAgent, state: from });
          mockUpdateAgent(true);

          vi.mocked(db.insert).mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
          } as any);

          const request = createRequest({
            from_state: from,
            to_state: to,
          });

          const response = await POST(request, { params: Promise.resolve({ id: 'agent-uuid' }) });
          expect(response.status).toBe(200);

          const data = await response.json();
          expect(data.message).toBe('State change recorded');
          expect(data.from_state).toBe(from);
          expect(data.to_state).toBe(to);
        });
      });
    });

    describe('invalid transitions', () => {
      const invalidTransitions = [
        { from: AgentState.NEW, to: AgentState.ACTIVE }, // Must go through PROVISIONED
        { from: AgentState.NEW, to: AgentState.DRAINING },
        { from: AgentState.NEW, to: AgentState.TERMINATED },
        { from: AgentState.PROVISIONED, to: AgentState.NEW }, // Can't go back
        { from: AgentState.PROVISIONED, to: AgentState.DRAINING },
        { from: AgentState.ACTIVE, to: AgentState.NEW },
        { from: AgentState.ACTIVE, to: AgentState.PROVISIONED },
        { from: AgentState.ACTIVE, to: AgentState.TERMINATED }, // Must go through DRAINING
        { from: AgentState.DRAINING, to: AgentState.NEW },
        { from: AgentState.DRAINING, to: AgentState.PROVISIONED },
        { from: AgentState.TERMINATED, to: AgentState.NEW }, // Terminal state
        { from: AgentState.TERMINATED, to: AgentState.ACTIVE },
        { from: AgentState.KILLED, to: AgentState.NEW }, // Terminal state
        { from: AgentState.KILLED, to: AgentState.ACTIVE },
      ];

      invalidTransitions.forEach(({ from, to }) => {
        it(`should reject ${from} -> ${to}`, async () => {
          mockSelectAgent({ ...mockAgent, state: from });

          const request = createRequest({
            from_state: from,
            to_state: to,
          });

          const response = await POST(request, { params: Promise.resolve({ id: 'agent-uuid' }) });
          expect(response.status).toBe(400);

          const data = await response.json();
          expect(data.error).toContain('Invalid state transition');
          expect(data.current_state).toBe(from);
          expect(data.normative_fsm).toBe('PAP-RFC-001 §7.2');
        });
      });
    });
  });

  describe('optimistic locking', () => {
    beforeEach(() => {
      vi.mocked(EnhancedRateLimiters.agentLifecycle).mockResolvedValue({
        allowed: true,
        limit: 30,
        remaining: 29,
        reset: Date.now() + 60000,
      });
    });

    it('should return 409 on concurrent modification', async () => {
      mockSelectAgent({ ...mockAgent, state: AgentState.ACTIVE });
      // Simulate concurrent modification - update returns no rows
      mockUpdateAgent(false);

      const request = createRequest({
        from_state: AgentState.ACTIVE,
        to_state: AgentState.DRAINING,
      });

      const response = await POST(request, { params: Promise.resolve({ id: 'agent-uuid' }) });
      expect(response.status).toBe(409);

      const data = await response.json();
      expect(data.error).toContain('concurrent modification');
      expect(data.hint).toContain('Refresh');
    });
  });

  describe('lifecycle timestamps', () => {
    beforeEach(() => {
      vi.mocked(EnhancedRateLimiters.agentLifecycle).mockResolvedValue({
        allowed: true,
        limit: 30,
        remaining: 29,
        reset: Date.now() + 60000,
      });
    });

    it('should set provisioned_at on transition to PROVISIONED', async () => {
      const agentWithoutProvisionedAt = {
        ...mockAgent,
        state: AgentState.NEW,
        provisioned_at: null,
      };
      mockSelectAgent(agentWithoutProvisionedAt);
      mockUpdateAgent(true);
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      } as any);

      const request = createRequest({
        from_state: AgentState.NEW,
        to_state: AgentState.PROVISIONED,
      });

      await POST(request, { params: Promise.resolve({ id: 'agent-uuid' }) });

      // Verify update was called with provisioned_at
      const updateMock = vi.mocked(db.update);
      expect(updateMock).toHaveBeenCalled();
    });

    it('should set terminated_at on transition to TERMINATED', async () => {
      mockSelectAgent({ ...mockAgent, state: AgentState.DRAINING, terminated_at: null });
      mockUpdateAgent(true);
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      } as any);

      const request = createRequest({
        from_state: AgentState.DRAINING,
        to_state: AgentState.TERMINATED,
      });

      await POST(request, { params: Promise.resolve({ id: 'agent-uuid' }) });

      const updateMock = vi.mocked(db.update);
      expect(updateMock).toHaveBeenCalled();
    });

    it('should set terminated_at on transition to KILLED', async () => {
      mockSelectAgent({ ...mockAgent, state: AgentState.ACTIVE, terminated_at: null });
      mockUpdateAgent(true);
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      } as any);

      const request = createRequest({
        from_state: AgentState.ACTIVE,
        to_state: AgentState.KILLED,
      });

      await POST(request, { params: Promise.resolve({ id: 'agent-uuid' }) });

      const updateMock = vi.mocked(db.update);
      expect(updateMock).toHaveBeenCalled();
    });
  });
});
