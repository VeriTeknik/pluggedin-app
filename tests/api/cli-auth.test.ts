/**
 * Tests for the device authorization flow (/api/cli/auth/*)
 *
 * Covers:
 * - POST /api/cli/auth/initiate  — device code generation
 * - GET  /api/cli/auth/poll      — polling for approval
 * - POST /api/cli/auth/approve   — user approval
 * - POST /api/cli/auth/deny      — user denial
 * - Shared validation helper     — _shared.ts
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports that use them
// ---------------------------------------------------------------------------

vi.mock('@/db', () => {
  const mockUpdate = vi.fn();
  const mockSet = vi.fn();
  const mockWhere = vi.fn();
  const mockReturning = vi.fn();

  // Chainable: db.update().set().where().returning()
  mockUpdate.mockReturnValue({ set: mockSet });
  mockSet.mockReturnValue({ where: mockWhere });
  mockWhere.mockReturnValue({ returning: mockReturning });

  const mockInsert = vi.fn();
  const mockValues = vi.fn();
  const mockInsertReturning = vi.fn();
  mockInsert.mockReturnValue({ values: mockValues });
  mockValues.mockReturnValue({ returning: mockInsertReturning });

  return {
    db: {
      insert: mockInsert,
      update: mockUpdate,
      query: {
        deviceAuthCodesTable: { findFirst: vi.fn() },
        projectsTable: { findFirst: vi.fn() },
        apiKeysTable: { findFirst: vi.fn() },
      },
      transaction: vi.fn(),
      // Expose inner mocks for assertions
      __mocks: {
        mockUpdate,
        mockSet,
        mockWhere,
        mockReturning,
        mockInsert,
        mockValues,
        mockInsertReturning,
      },
    },
  };
});

// vi.hoisted runs before vi.mock factories (which are hoisted above normal code).
// This lets all route imports capture the same controllable fn reference.
const { mockRateLimiterFn } = vi.hoisted(() => ({
  mockRateLimiterFn: vi.fn().mockResolvedValue({ allowed: true, limit: 100, remaining: 99, reset: 0 }),
}));

vi.mock('@/lib/rate-limiter', () => ({
  createRateLimiter: () => mockRateLimiterFn,
}));

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { db } from '@/db';
import { getServerSession } from 'next-auth/next';
import { POST as initiateHandler } from '@/app/api/cli/auth/initiate/route';
import { GET as pollHandler } from '@/app/api/cli/auth/poll/route';
import { POST as approveHandler } from '@/app/api/cli/auth/approve/route';
import { POST as denyHandler } from '@/app/api/cli/auth/deny/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockedGetServerSession = vi.mocked(getServerSession);

function createNextRequest(
  url: string,
  options?: { method?: string; body?: unknown; headers?: Record<string, string> }
): NextRequest {
  const init: RequestInit = {
    method: options?.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  };
  if (options?.body) {
    init.body = JSON.stringify(options.body);
  }
  return new NextRequest(url, init);
}

const VALID_DEVICE_CODE = 'a'.repeat(48); // 48-char alphanumeric

function pendingRecord(overrides = {}) {
  return {
    uuid: 'record-uuid',
    device_code: VALID_DEVICE_CODE,
    user_code: 'ABCD-5678',
    status: 'pending',
    api_key_uuid: null,
    user_id: null,
    project_uuid: null,
    client_ip: '127.0.0.1',
    expires_at: new Date(Date.now() + 300_000), // 5 min in the future
    created_at: new Date(),
    approved_at: null,
    denied_at: null,
    consumed_at: null,
    ...overrides,
  };
}

function approvedRecord(overrides = {}) {
  return pendingRecord({
    status: 'approved',
    api_key_uuid: 'api-key-uuid',
    user_id: 'test-user-id',
    project_uuid: 'test-project-uuid',
    approved_at: new Date(),
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Device Auth Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_URL = 'https://plugged.in';
  });

  // =========================================================================
  // POST /api/cli/auth/initiate
  // =========================================================================
  describe('POST /api/cli/auth/initiate', () => {
    it('should return device_code, user_code, and verification_url', async () => {
      const req = createNextRequest('http://localhost:12005/api/cli/auth/initiate', {
        method: 'POST',
      });

      const res = await initiateHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.device_code).toBeDefined();
      expect(data.device_code).toHaveLength(48);
      expect(data.user_code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
      expect(data.verification_url).toContain('/cli/authorize?code=');
      expect(data.expires_in).toBe(300);
      expect(data.interval).toBe(5);
    });

    it('should return 500 when NEXTAUTH_URL is not set', async () => {
      delete process.env.NEXTAUTH_URL;

      const req = createNextRequest('http://localhost:12005/api/cli/auth/initiate', {
        method: 'POST',
      });

      const res = await initiateHandler(req);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.code).toBe('SERVER_ERROR');
      // Should NOT have inserted into DB
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('should insert a record into deviceAuthCodesTable', async () => {
      const req = createNextRequest('http://localhost:12005/api/cli/auth/initiate', {
        method: 'POST',
      });

      await initiateHandler(req);

      expect(db.insert).toHaveBeenCalled();
    });

    it('should extract client IP from x-forwarded-for', async () => {
      const req = createNextRequest('http://localhost:12005/api/cli/auth/initiate', {
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.50, 10.0.0.1' },
      });

      await initiateHandler(req);

      // The insert should have been called with the first IP
      const mocks = (db as any).__mocks;
      const insertValues = mocks.mockValues.mock.calls[0][0];
      expect(insertValues.client_ip).toBe('203.0.113.50');
    });

    it('should return 429 when rate limited', async () => {
      mockRateLimiterFn.mockResolvedValueOnce({ allowed: false, limit: 5, remaining: 0, reset: 0 });

      const req = createNextRequest('http://localhost:12005/api/cli/auth/initiate', {
        method: 'POST',
      });

      const res = await initiateHandler(req);
      const data = await res.json();

      expect(res.status).toBe(429);
      expect(data.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // GET /api/cli/auth/poll
  // =========================================================================
  describe('GET /api/cli/auth/poll', () => {
    it('should return authorization_pending for pending codes', async () => {
      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        pendingRecord() as any
      );

      const req = createNextRequest(
        `http://localhost:12005/api/cli/auth/poll?device_code=${VALID_DEVICE_CODE}`
      );

      const res = await pollHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe('authorization_pending');
    });

    it('should return 400 for invalid device_code format', async () => {
      const req = createNextRequest(
        'http://localhost:12005/api/cli/auth/poll?device_code=too-short'
      );

      const res = await pollHandler(req);

      expect(res.status).toBe(400);
    });

    it('should return 400 for missing device_code', async () => {
      const req = createNextRequest('http://localhost:12005/api/cli/auth/poll');

      const res = await pollHandler(req);

      expect(res.status).toBe(400);
    });

    it('should return 404 when device_code not found', async () => {
      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        undefined as any
      );

      const req = createNextRequest(
        `http://localhost:12005/api/cli/auth/poll?device_code=${VALID_DEVICE_CODE}`
      );

      const res = await pollHandler(req);

      expect(res.status).toBe(404);
    });

    it('should return expired (410) for expired codes', async () => {
      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        pendingRecord({ expires_at: new Date(Date.now() - 1000) }) as any
      );

      const req = createNextRequest(
        `http://localhost:12005/api/cli/auth/poll?device_code=${VALID_DEVICE_CODE}`
      );

      const res = await pollHandler(req);
      const data = await res.json();

      expect(res.status).toBe(410);
      expect(data.status).toBe('expired');
    });

    it('should auto-expire stale pending codes on read', async () => {
      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        pendingRecord({ expires_at: new Date(Date.now() - 1000) }) as any
      );

      const req = createNextRequest(
        `http://localhost:12005/api/cli/auth/poll?device_code=${VALID_DEVICE_CODE}`
      );

      await pollHandler(req);

      // Should have called update to set status to 'expired'
      expect(db.update).toHaveBeenCalled();
    });

    it('should auto-expire stale approved records on read', async () => {
      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        approvedRecord({ expires_at: new Date(Date.now() - 1000) }) as any
      );

      const req = createNextRequest(
        `http://localhost:12005/api/cli/auth/poll?device_code=${VALID_DEVICE_CODE}`
      );

      const res = await pollHandler(req);
      const data = await res.json();

      expect(res.status).toBe(410);
      expect(data.status).toBe('expired');
      // Should have updated the approved record to expired in DB
      expect(db.update).toHaveBeenCalled();
    });

    it('should return approved with api_key on first successful poll', async () => {
      const record = approvedRecord();
      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        record as any
      );

      // Mock the transaction
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) => {
        const tx = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ uuid: 'record-uuid' }]),
              }),
            }),
          }),
          query: {
            apiKeysTable: {
              findFirst: vi.fn().mockResolvedValue({ api_key: 'pg_in_test_key_123' }),
            },
          },
        };
        return callback(tx as any);
      });

      const req = createNextRequest(
        `http://localhost:12005/api/cli/auth/poll?device_code=${VALID_DEVICE_CODE}`
      );

      const res = await pollHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe('approved');
      expect(data.api_key).toBe('pg_in_test_key_123');
    });

    it('should set consumed_at timestamp when consuming an approved code', async () => {
      const record = approvedRecord();
      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        record as any
      );

      const capturedSet = vi.fn();
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) => {
        const tx = {
          update: vi.fn().mockReturnValue({
            set: capturedSet.mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ uuid: 'record-uuid' }]),
              }),
            }),
          }),
          query: {
            apiKeysTable: {
              findFirst: vi.fn().mockResolvedValue({ api_key: 'pg_in_test_key_123' }),
            },
          },
        };
        return callback(tx as any);
      });

      const req = createNextRequest(
        `http://localhost:12005/api/cli/auth/poll?device_code=${VALID_DEVICE_CODE}`
      );

      await pollHandler(req);

      const setArg = capturedSet.mock.calls[0][0];
      expect(setArg.status).toBe('consumed');
      expect(setArg.consumed_at).toBeInstanceOf(Date);
    });

    it('should return approved without api_key when already consumed by concurrent poll', async () => {
      const record = approvedRecord();
      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        record as any
      );

      // Transaction returns null (concurrent poll already consumed)
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) => {
        const tx = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([]), // 0 rows updated
              }),
            }),
          }),
        };
        return callback(tx as any);
      });

      const req = createNextRequest(
        `http://localhost:12005/api/cli/auth/poll?device_code=${VALID_DEVICE_CODE}`
      );

      const res = await pollHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe('approved');
      expect(data.api_key).toBeUndefined();
    });

    it('should return 500 when api_key_uuid is missing on approved record', async () => {
      const record = approvedRecord({ api_key_uuid: null });
      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        record as any
      );

      const req = createNextRequest(
        `http://localhost:12005/api/cli/auth/poll?device_code=${VALID_DEVICE_CODE}`
      );

      const res = await pollHandler(req);

      expect(res.status).toBe(500);
    });

    it('should return denied (403) for denied codes', async () => {
      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        pendingRecord({ status: 'denied' }) as any
      );

      const req = createNextRequest(
        `http://localhost:12005/api/cli/auth/poll?device_code=${VALID_DEVICE_CODE}`
      );

      const res = await pollHandler(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.status).toBe('denied');
    });

    it('should return approved (no api_key) for consumed codes', async () => {
      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        pendingRecord({ status: 'consumed' }) as any
      );

      const req = createNextRequest(
        `http://localhost:12005/api/cli/auth/poll?device_code=${VALID_DEVICE_CODE}`
      );

      const res = await pollHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe('approved');
      expect(data.api_key).toBeUndefined();
    });

    it('should include Retry-After header on 429', async () => {
      mockRateLimiterFn.mockResolvedValueOnce({ allowed: false, limit: 100, remaining: 0, reset: 0 });

      const req = createNextRequest(
        `http://localhost:12005/api/cli/auth/poll?device_code=${VALID_DEVICE_CODE}`
      );

      const res = await pollHandler(req);

      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBe('5');
    });

    it('should return 500 when API key row is deleted (API_KEY_MISSING)', async () => {
      const record = approvedRecord();
      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        record as any
      );

      // Transaction throws API_KEY_MISSING
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) => {
        const tx = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ uuid: 'record-uuid' }]),
              }),
            }),
          }),
          query: {
            apiKeysTable: {
              findFirst: vi.fn().mockResolvedValue(null), // key deleted
            },
          },
        };
        return callback(tx as any);
      });

      const req = createNextRequest(
        `http://localhost:12005/api/cli/auth/poll?device_code=${VALID_DEVICE_CODE}`
      );

      const res = await pollHandler(req);

      expect(res.status).toBe(500);
    });
  });

  // =========================================================================
  // POST /api/cli/auth/approve
  // =========================================================================
  describe('POST /api/cli/auth/approve', () => {
    beforeEach(() => {
      mockedGetServerSession.mockResolvedValue({
        user: { id: 'test-user-id', email: 'test@example.com' },
        expires: new Date(Date.now() + 86400_000).toISOString(),
      } as any);
    });

    it('should return 401 when not authenticated', async () => {
      mockedGetServerSession.mockResolvedValueOnce(null);

      const req = createNextRequest('http://localhost:12005/api/cli/auth/approve', {
        method: 'POST',
        body: { user_code: 'ABCD-5678' },
      });

      const res = await approveHandler(req);

      expect(res.status).toBe(401);
    });

    it('should return 400 for invalid user_code format', async () => {
      const req = createNextRequest('http://localhost:12005/api/cli/auth/approve', {
        method: 'POST',
        body: { user_code: 'invalid' },
      });

      const res = await approveHandler(req);

      expect(res.status).toBe(400);
    });

    it('should return 404 when user_code not found', async () => {
      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        undefined as any
      );

      const req = createNextRequest('http://localhost:12005/api/cli/auth/approve', {
        method: 'POST',
        body: { user_code: 'ABCD-5678' },
      });

      const res = await approveHandler(req);

      expect(res.status).toBe(404);
    });

    it('should return 409 for already-used codes', async () => {
      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        pendingRecord({ status: 'approved' }) as any
      );

      const req = createNextRequest('http://localhost:12005/api/cli/auth/approve', {
        method: 'POST',
        body: { user_code: 'ABCD-5678' },
      });

      const res = await approveHandler(req);
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.code).toBe('ALREADY_USED');
    });

    it('should return 410 for expired codes', async () => {
      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        pendingRecord({ status: 'expired' }) as any
      );

      const req = createNextRequest('http://localhost:12005/api/cli/auth/approve', {
        method: 'POST',
        body: { user_code: 'ABCD-5678' },
      });

      const res = await approveHandler(req);
      const data = await res.json();

      expect(res.status).toBe(410);
      expect(data.code).toBe('EXPIRED');
    });

    it('should auto-expire and return 410 for pending but past-expiry codes', async () => {
      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        pendingRecord({ expires_at: new Date(Date.now() - 1000) }) as any
      );

      const req = createNextRequest('http://localhost:12005/api/cli/auth/approve', {
        method: 'POST',
        body: { user_code: 'ABCD-5678' },
      });

      const res = await approveHandler(req);
      const data = await res.json();

      expect(res.status).toBe(410);
      expect(data.code).toBe('EXPIRED');
      // Should have written 'expired' to the DB
      expect(db.update).toHaveBeenCalled();
      const mocks = (db as any).__mocks;
      const setArg = mocks.mockSet.mock.calls[0][0];
      expect(setArg.status).toBe('expired');
    });

    it('should approve with default project when no project_uuid provided', async () => {
      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        pendingRecord() as any
      );

      vi.mocked(db.query.projectsTable.findFirst).mockResolvedValueOnce({
        uuid: 'default-project-uuid',
      } as any);

      vi.mocked(db.transaction).mockImplementationOnce(async (callback) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ uuid: 'new-api-key-uuid' }]),
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ uuid: 'record-uuid' }]),
              }),
            }),
          }),
        };
        return callback(tx as any);
      });

      const req = createNextRequest('http://localhost:12005/api/cli/auth/approve', {
        method: 'POST',
        body: { user_code: 'ABCD-5678' },
      });

      const res = await approveHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe('approved');
    });

    it('should set approved_at timestamp in the transaction', async () => {
      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        pendingRecord() as any
      );

      vi.mocked(db.query.projectsTable.findFirst).mockResolvedValueOnce({
        uuid: 'default-project-uuid',
      } as any);

      const capturedSet = vi.fn();
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ uuid: 'new-api-key-uuid' }]),
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: capturedSet.mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ uuid: 'record-uuid' }]),
              }),
            }),
          }),
        };
        return callback(tx as any);
      });

      const req = createNextRequest('http://localhost:12005/api/cli/auth/approve', {
        method: 'POST',
        body: { user_code: 'ABCD-5678' },
      });

      await approveHandler(req);

      const setArg = capturedSet.mock.calls[0][0];
      expect(setArg.status).toBe('approved');
      expect(setArg.approved_at).toBeInstanceOf(Date);
    });

    it('should return 400 NO_HUB when user has no projects', async () => {
      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        pendingRecord() as any
      );

      vi.mocked(db.query.projectsTable.findFirst).mockResolvedValueOnce(
        undefined as any
      );

      const req = createNextRequest('http://localhost:12005/api/cli/auth/approve', {
        method: 'POST',
        body: { user_code: 'ABCD-5678' },
      });

      const res = await approveHandler(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.code).toBe('NO_HUB');
    });

    it('should return 403 when project_uuid belongs to another user', async () => {
      const otherProjectUuid = '11111111-1111-1111-1111-111111111111';

      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        pendingRecord() as any
      );

      vi.mocked(db.query.projectsTable.findFirst).mockResolvedValueOnce({
        uuid: otherProjectUuid,
        user_id: 'other-user-id', // different from session user
      } as any);

      const req = createNextRequest('http://localhost:12005/api/cli/auth/approve', {
        method: 'POST',
        body: {
          user_code: 'ABCD-5678',
          project_uuid: otherProjectUuid,
        },
      });

      const res = await approveHandler(req);

      expect(res.status).toBe(403);
    });

    it('should return 409 CONFLICT on TOCTOU race (status changed between read and update)', async () => {
      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        pendingRecord() as any
      );

      vi.mocked(db.query.projectsTable.findFirst).mockResolvedValueOnce({
        uuid: 'default-project-uuid',
      } as any);

      // Transaction throws DEVICE_CODE_CONFLICT (0 rows updated)
      vi.mocked(db.transaction).mockImplementationOnce(async (callback) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ uuid: 'new-api-key-uuid' }]),
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([]), // 0 rows — race
              }),
            }),
          }),
        };
        return callback(tx as any);
      });

      const req = createNextRequest('http://localhost:12005/api/cli/auth/approve', {
        method: 'POST',
        body: { user_code: 'ABCD-5678' },
      });

      const res = await approveHandler(req);
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.code).toBe('CONFLICT');
    });
  });

  // =========================================================================
  // POST /api/cli/auth/deny
  // =========================================================================
  describe('POST /api/cli/auth/deny', () => {
    beforeEach(() => {
      mockedGetServerSession.mockResolvedValue({
        user: { id: 'test-user-id', email: 'test@example.com' },
        expires: new Date(Date.now() + 86400_000).toISOString(),
      } as any);
    });

    it('should return 401 when not authenticated', async () => {
      mockedGetServerSession.mockResolvedValueOnce(null);

      const req = createNextRequest('http://localhost:12005/api/cli/auth/deny', {
        method: 'POST',
        body: { user_code: 'ABCD-5678' },
      });

      const res = await denyHandler(req);

      expect(res.status).toBe(401);
    });

    it('should return 400 for invalid user_code format', async () => {
      const req = createNextRequest('http://localhost:12005/api/cli/auth/deny', {
        method: 'POST',
        body: { user_code: 'not-valid' },
      });

      const res = await denyHandler(req);

      expect(res.status).toBe(400);
    });

    it('should deny a pending code and return status denied', async () => {
      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        pendingRecord() as any
      );

      // db.update().set().where().returning() chain
      const mocks = (db as any).__mocks;
      mocks.mockReturning.mockResolvedValueOnce([{ uuid: 'record-uuid' }]);

      const req = createNextRequest('http://localhost:12005/api/cli/auth/deny', {
        method: 'POST',
        body: { user_code: 'ABCD-5678' },
      });

      const res = await denyHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe('denied');
    });

    it('should set denied_at timestamp', async () => {
      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        pendingRecord() as any
      );

      const mocks = (db as any).__mocks;
      mocks.mockReturning.mockResolvedValueOnce([{ uuid: 'record-uuid' }]);

      const req = createNextRequest('http://localhost:12005/api/cli/auth/deny', {
        method: 'POST',
        body: { user_code: 'ABCD-5678' },
      });

      await denyHandler(req);

      // The .set() call should include denied_at
      const setArg = mocks.mockSet.mock.calls[0][0];
      expect(setArg.status).toBe('denied');
      expect(setArg.denied_at).toBeInstanceOf(Date);
    });

    it('should return 409 CONFLICT when status already changed (TOCTOU)', async () => {
      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        pendingRecord() as any
      );

      const mocks = (db as any).__mocks;
      mocks.mockReturning.mockResolvedValueOnce([]); // 0 rows updated

      const req = createNextRequest('http://localhost:12005/api/cli/auth/deny', {
        method: 'POST',
        body: { user_code: 'ABCD-5678' },
      });

      const res = await denyHandler(req);
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.code).toBe('CONFLICT');
    });

    it('should return 404 for unknown user_code', async () => {
      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        undefined as any
      );

      const req = createNextRequest('http://localhost:12005/api/cli/auth/deny', {
        method: 'POST',
        body: { user_code: 'XXXX-9999' },
      });

      const res = await denyHandler(req);

      expect(res.status).toBe(404);
    });

    it('should return 409 ALREADY_USED for already-consumed codes', async () => {
      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        pendingRecord({ status: 'consumed' }) as any
      );

      const req = createNextRequest('http://localhost:12005/api/cli/auth/deny', {
        method: 'POST',
        body: { user_code: 'ABCD-5678' },
      });

      const res = await denyHandler(req);
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.code).toBe('ALREADY_USED');
    });

    it('should return 410 EXPIRED for expired codes', async () => {
      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        pendingRecord({ status: 'expired' }) as any
      );

      const req = createNextRequest('http://localhost:12005/api/cli/auth/deny', {
        method: 'POST',
        body: { user_code: 'ABCD-5678' },
      });

      const res = await denyHandler(req);
      const data = await res.json();

      expect(res.status).toBe(410);
      expect(data.code).toBe('EXPIRED');
    });
  });

  // =========================================================================
  // Shared validation (_shared.ts) — tested indirectly through approve/deny
  // =========================================================================
  describe('Shared validation (_shared.ts)', () => {
    beforeEach(() => {
      mockedGetServerSession.mockResolvedValue({
        user: { id: 'test-user-id', email: 'test@example.com' },
        expires: new Date(Date.now() + 86400_000).toISOString(),
      } as any);
    });

    it('should reject user_code with ambiguous characters (0, O, 1, I, L)', async () => {
      // O, I, L, 0, 1 are excluded from the unambiguous alphabet
      const ambiguousCodes = ['ABCO-DEFG', 'ABCI-DEFG', 'ABCL-DEFG', 'ABC0-DEFG', 'ABC1-DEFG'];
      for (const code of ambiguousCodes) {
        const req = createNextRequest('http://localhost:12005/api/cli/auth/approve', {
          method: 'POST',
          body: { user_code: code },
        });

        const res = await approveHandler(req);
        expect(res.status).toBe(400);
      }
    });

    it('should reject lowercase user_code', async () => {
      const req = createNextRequest('http://localhost:12005/api/cli/auth/approve', {
        method: 'POST',
        body: { user_code: 'abcd-5678' },
      });

      const res = await approveHandler(req);

      expect(res.status).toBe(400);
    });

    it('should reject user_code without dash separator', async () => {
      const req = createNextRequest('http://localhost:12005/api/cli/auth/approve', {
        method: 'POST',
        body: { user_code: 'ABCD5678' },
      });

      const res = await approveHandler(req);

      expect(res.status).toBe(400);
    });

    it('should reject invalid JSON body', async () => {
      const req = new NextRequest('http://localhost:12005/api/cli/auth/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });

      const res = await approveHandler(req);

      expect(res.status).toBe(400);
    });

    it('should accept valid unambiguous user_code', async () => {
      vi.mocked(db.query.deviceAuthCodesTable.findFirst).mockResolvedValueOnce(
        pendingRecord() as any
      );
      vi.mocked(db.query.projectsTable.findFirst).mockResolvedValueOnce({
        uuid: 'test-project-uuid',
      } as any);
      vi.mocked(db.transaction).mockResolvedValueOnce(true);

      const req = createNextRequest('http://localhost:12005/api/cli/auth/approve', {
        method: 'POST',
        body: { user_code: 'ABCD-5678' },
      });

      const res = await approveHandler(req);

      expect(res.status).toBe(200);
    });
  });
});
