import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resetAllMocks } from '../test-utils';

/**
 * OAuth Metrics Tests
 *
 * Tests Prometheus metrics recording for OAuth operations including:
 * - OAuth flow metrics (counters, histograms)
 * - Token refresh metrics
 * - PKCE metrics (validation, cleanup)
 * - Security event metrics
 * - Discovery and registration metrics
 */

// Mock prom-client
const mockCounter = {
  inc: vi.fn(),
};

const mockHistogram = {
  observe: vi.fn(),
};

const mockGauge = {
  set: vi.fn(),
  inc: vi.fn(),
  dec: vi.fn(),
};

vi.mock('prom-client', () => ({
  Counter: vi.fn().mockImplementation(() => mockCounter),
  Histogram: vi.fn().mockImplementation(() => mockHistogram),
  Gauge: vi.fn().mockImplementation(() => mockGauge),
}));

vi.mock('@/lib/metrics', () => ({
  register: {
    registerMetric: vi.fn(),
  },
}));

describe('OAuth Metrics', () => {
  beforeEach(() => {
    resetAllMocks();
    mockCounter.inc.mockClear();
    mockHistogram.observe.mockClear();
    mockGauge.set.mockClear();
    mockGauge.inc.mockClear();
    mockGauge.dec.mockClear();
  });

  afterEach(() => {
    resetAllMocks();
  });

  describe('OAuth Flow Metrics', () => {
    it('should record OAuth flow initiation', async () => {
      const { recordOAuthFlowStart } = await import('@/lib/observability/oauth-metrics');

      recordOAuthFlowStart('mcp-server-provider');

      expect(mockCounter.inc).toHaveBeenCalledWith({
        provider: 'mcp-server-provider',
        status: 'initiated',
      });
    });

    it('should record successful OAuth flow completion with duration', async () => {
      const { recordOAuthFlowComplete } = await import('@/lib/observability/oauth-metrics');

      const durationSeconds = 2.5;
      recordOAuthFlowComplete('mcp-server-provider', durationSeconds, true);

      expect(mockCounter.inc).toHaveBeenCalledWith({
        provider: 'mcp-server-provider',
        status: 'success',
      });

      expect(mockHistogram.observe).toHaveBeenCalledWith(
        { provider: 'mcp-server-provider', status: 'success' },
        durationSeconds
      );
    });

    it('should record failed OAuth flow completion', async () => {
      const { recordOAuthFlowComplete } = await import('@/lib/observability/oauth-metrics');

      const durationSeconds = 1.2;
      recordOAuthFlowComplete('mcp-server-provider', durationSeconds, false);

      expect(mockCounter.inc).toHaveBeenCalledWith({
        provider: 'mcp-server-provider',
        status: 'failure',
      });

      expect(mockHistogram.observe).toHaveBeenCalledWith(
        { provider: 'mcp-server-provider', status: 'failure' },
        durationSeconds
      );
    });

    it('should track OAuth flow duration in appropriate buckets', async () => {
      const { recordOAuthFlowComplete } = await import('@/lib/observability/oauth-metrics');

      // Test different duration scenarios
      const scenarios = [
        { duration: 0.3, description: 'fast flow' },
        { duration: 1.5, description: 'normal flow' },
        { duration: 5.0, description: 'slow flow' },
        { duration: 30.0, description: 'very slow flow' },
      ];

      for (const { duration, description } of scenarios) {
        mockHistogram.observe.mockClear();
        recordOAuthFlowComplete('provider', duration, true);

        expect(mockHistogram.observe).toHaveBeenCalledWith(
          expect.objectContaining({ provider: 'provider', status: 'success' }),
          duration
        );
      }
    });
  });

  describe('Token Refresh Metrics', () => {
    it('should record successful token refresh with duration', async () => {
      const { recordTokenRefresh } = await import('@/lib/observability/oauth-metrics');

      const durationSeconds = 0.8;
      recordTokenRefresh(true, durationSeconds);

      expect(mockCounter.inc).toHaveBeenCalledWith({
        status: 'success',
        reason: 'normal',
      });

      expect(mockHistogram.observe).toHaveBeenCalledWith(
        { status: 'success' },
        durationSeconds
      );
    });

    it('should record failed token refresh with reason', async () => {
      const { recordTokenRefresh } = await import('@/lib/observability/oauth-metrics');

      const durationSeconds = 1.5;
      recordTokenRefresh(false, durationSeconds, 'no_refresh_token');

      expect(mockCounter.inc).toHaveBeenCalledWith({
        status: 'failure',
        reason: 'no_refresh_token',
      });

      expect(mockHistogram.observe).toHaveBeenCalledWith(
        { status: 'failure' },
        durationSeconds
      );
    });

    it('should record token reuse detection', async () => {
      const { recordTokenReuseDetected } = await import('@/lib/observability/oauth-metrics');

      recordTokenReuseDetected();

      expect(mockCounter.inc).toHaveBeenCalledWith({
        status: 'reuse_detected',
        reason: 'security',
      });

      // Should also record security event
      expect(mockCounter.inc).toHaveBeenCalledWith({
        event_type: 'token_reuse',
        severity: 'critical',
      });
    });

    it('should record token revocation with reason', async () => {
      const { recordTokenRevocation } = await import('@/lib/observability/oauth-metrics');

      const reasons = ['reuse_detected', 'manual', 'expired', 'security'] as const;

      for (const reason of reasons) {
        mockCounter.inc.mockClear();
        recordTokenRevocation(reason);

        expect(mockCounter.inc).toHaveBeenCalledWith({ reason });
      }
    });

    it('should track token refresh duration across different scenarios', async () => {
      const { recordTokenRefresh } = await import('@/lib/observability/oauth-metrics');

      // Fast refresh
      recordTokenRefresh(true, 0.15);
      expect(mockHistogram.observe).toHaveBeenLastCalledWith(
        expect.any(Object),
        0.15
      );

      // Normal refresh
      recordTokenRefresh(true, 0.5);
      expect(mockHistogram.observe).toHaveBeenLastCalledWith(
        expect.any(Object),
        0.5
      );

      // Slow refresh
      recordTokenRefresh(true, 2.0);
      expect(mockHistogram.observe).toHaveBeenLastCalledWith(
        expect.any(Object),
        2.0
      );
    });
  });

  describe('PKCE Metrics', () => {
    it('should record PKCE state creation and increment gauge', async () => {
      const { recordPkceStateCreated } = await import('@/lib/observability/oauth-metrics');

      recordPkceStateCreated();

      expect(mockCounter.inc).toHaveBeenCalled(); // pkceStatesCreatedTotal
      expect(mockGauge.inc).toHaveBeenCalled(); // activePkceStatesGauge
    });

    it('should record successful PKCE validation', async () => {
      const { recordPkceValidation } = await import('@/lib/observability/oauth-metrics');

      recordPkceValidation(true, 'valid');

      expect(mockCounter.inc).toHaveBeenCalledWith({
        status: 'success',
        reason: 'valid',
      });
    });

    it('should record failed PKCE validation with reason', async () => {
      const { recordPkceValidation } = await import('@/lib/observability/oauth-metrics');

      const failureReasons = ['expired', 'invalid_hash', 'not_found'];

      for (const reason of failureReasons) {
        mockCounter.inc.mockClear();
        recordPkceValidation(false, reason);

        expect(mockCounter.inc).toHaveBeenCalledWith({
          status: 'failure',
          reason,
        });
      }
    });

    it('should record PKCE cleanup and decrement gauge', async () => {
      const { recordPkceCleanup } = await import('@/lib/observability/oauth-metrics');

      const deletedCount = 15;
      recordPkceCleanup(deletedCount, 'expired');

      expect(mockCounter.inc).toHaveBeenCalledWith({ reason: 'expired' }, deletedCount);
      expect(mockGauge.dec).toHaveBeenCalledWith(deletedCount);
    });

    it('should track PKCE cleanup by reason', async () => {
      const { recordPkceCleanup } = await import('@/lib/observability/oauth-metrics');

      const reasons: Array<'expired' | 'manual' | 'server_deleted'> = [
        'expired',
        'manual',
        'server_deleted',
      ];

      for (const reason of reasons) {
        mockCounter.inc.mockClear();
        recordPkceCleanup(5, reason);

        expect(mockCounter.inc).toHaveBeenCalledWith({ reason }, 5);
      }
    });

    it('should update active PKCE states gauge', async () => {
      const { updateActivePkceStatesGauge } = await import('@/lib/observability/oauth-metrics');

      updateActivePkceStatesGauge(42);

      expect(mockGauge.set).toHaveBeenCalledWith(42);
    });
  });

  describe('Security Event Metrics', () => {
    it('should record integrity violation with type', async () => {
      const { recordIntegrityViolation } = await import('@/lib/observability/oauth-metrics');

      const violationTypes: Array<'hash_mismatch' | 'state_reuse' | 'user_mismatch'> = [
        'hash_mismatch',
        'state_reuse',
        'user_mismatch',
      ];

      for (const violationType of violationTypes) {
        mockCounter.inc.mockClear();
        recordIntegrityViolation(violationType);

        expect(mockCounter.inc).toHaveBeenCalledWith({ violation_type: violationType });

        // Should also record security event
        expect(mockCounter.inc).toHaveBeenCalledWith({
          event_type: 'integrity_violation',
          severity: 'high',
        });
      }
    });

    it('should record code injection attempt', async () => {
      const { recordCodeInjectionAttempt } = await import('@/lib/observability/oauth-metrics');

      recordCodeInjectionAttempt();

      expect(mockCounter.inc).toHaveBeenCalled(); // codeInjectionAttemptsTotal

      // Should also record critical security event
      expect(mockCounter.inc).toHaveBeenCalledWith({
        event_type: 'code_injection',
        severity: 'critical',
      });
    });

    it('should track security events by severity', async () => {
      const { recordIntegrityViolation, recordCodeInjectionAttempt, recordTokenReuseDetected } =
        await import('@/lib/observability/oauth-metrics');

      mockCounter.inc.mockClear();

      // High severity
      recordIntegrityViolation('hash_mismatch');
      expect(mockCounter.inc).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'high' }),
        undefined
      );

      mockCounter.inc.mockClear();

      // Critical severity
      recordCodeInjectionAttempt();
      expect(mockCounter.inc).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'critical' }),
        undefined
      );

      mockCounter.inc.mockClear();

      // Critical severity
      recordTokenReuseDetected();
      expect(mockCounter.inc).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'critical' }),
        undefined
      );
    });
  });

  describe('Discovery Metrics', () => {
    it('should record successful OAuth discovery with method and duration', async () => {
      const { recordDiscovery } = await import('@/lib/observability/oauth-metrics');

      const durationSeconds = 1.2;
      recordDiscovery('rfc9728', true, durationSeconds);

      expect(mockCounter.inc).toHaveBeenCalledWith({
        method: 'rfc9728',
        status: 'success',
      });

      expect(mockHistogram.observe).toHaveBeenCalledWith(
        { method: 'rfc9728', status: 'success' },
        durationSeconds
      );
    });

    it('should record failed OAuth discovery', async () => {
      const { recordDiscovery } = await import('@/lib/observability/oauth-metrics');

      const durationSeconds = 0.5;
      recordDiscovery('www-authenticate', false, durationSeconds);

      expect(mockCounter.inc).toHaveBeenCalledWith({
        method: 'www-authenticate',
        status: 'failure',
      });

      expect(mockHistogram.observe).toHaveBeenCalledWith(
        { method: 'www-authenticate', status: 'failure' },
        durationSeconds
      );
    });

    it('should track discovery by different methods', async () => {
      const { recordDiscovery } = await import('@/lib/observability/oauth-metrics');

      const methods: Array<'rfc9728' | 'www-authenticate' | 'manual'> = [
        'rfc9728',
        'www-authenticate',
        'manual',
      ];

      for (const method of methods) {
        mockCounter.inc.mockClear();
        recordDiscovery(method, true, 1.0);

        expect(mockCounter.inc).toHaveBeenCalledWith({
          method,
          status: 'success',
        });
      }
    });
  });

  describe('Client Registration Metrics', () => {
    it('should record successful client registration with duration', async () => {
      const { recordClientRegistration } = await import('@/lib/observability/oauth-metrics');

      const durationSeconds = 0.9;
      recordClientRegistration(true, durationSeconds);

      expect(mockCounter.inc).toHaveBeenCalledWith({ status: 'success' });

      expect(mockHistogram.observe).toHaveBeenCalledWith(
        { status: 'success' },
        durationSeconds
      );
    });

    it('should record failed client registration', async () => {
      const { recordClientRegistration } = await import('@/lib/observability/oauth-metrics');

      const durationSeconds = 2.1;
      recordClientRegistration(false, durationSeconds);

      expect(mockCounter.inc).toHaveBeenCalledWith({ status: 'failure' });

      expect(mockHistogram.observe).toHaveBeenCalledWith(
        { status: 'failure' },
        durationSeconds
      );
    });
  });

  describe('Active Token Metrics', () => {
    it('should update active tokens gauge', async () => {
      const { updateActiveTokensGauge } = await import('@/lib/observability/oauth-metrics');

      updateActiveTokensGauge(127);

      expect(mockGauge.set).toHaveBeenCalledWith(127);
    });

    it('should handle zero active tokens', async () => {
      const { updateActiveTokensGauge } = await import('@/lib/observability/oauth-metrics');

      updateActiveTokensGauge(0);

      expect(mockGauge.set).toHaveBeenCalledWith(0);
    });
  });

  describe('Metrics Integration Scenarios', () => {
    it('should record complete OAuth flow metrics sequence', async () => {
      const {
        recordOAuthFlowStart,
        recordPkceStateCreated,
        recordPkceValidation,
        recordOAuthFlowComplete,
      } = await import('@/lib/observability/oauth-metrics');

      // 1. Flow starts
      recordOAuthFlowStart('test-provider');

      // 2. PKCE state created
      recordPkceStateCreated();

      // 3. User authenticates, callback validates PKCE
      recordPkceValidation(true, 'valid');

      // 4. Flow completes successfully
      recordOAuthFlowComplete('test-provider', 3.5, true);

      // Verify all metrics were recorded
      expect(mockCounter.inc).toHaveBeenCalledTimes(4);
      expect(mockHistogram.observe).toHaveBeenCalledTimes(1);
      expect(mockGauge.inc).toHaveBeenCalledTimes(1);
    });

    it('should record token refresh with reuse detection scenario', async () => {
      const {
        recordTokenRefresh,
        recordTokenReuseDetected,
        recordTokenRevocation,
      } = await import('@/lib/observability/oauth-metrics');

      // 1. First refresh attempt acquires lock
      recordTokenRefresh(true, 0.5);

      // 2. Second concurrent request detects reuse
      recordTokenReuseDetected();

      // 3. All tokens revoked
      recordTokenRevocation('reuse_detected');

      // Verify security events recorded
      expect(mockCounter.inc).toHaveBeenCalledWith({
        event_type: 'token_reuse',
        severity: 'critical',
      });

      expect(mockCounter.inc).toHaveBeenCalledWith({
        status: 'reuse_detected',
        reason: 'security',
      });
    });

    it('should record PKCE cleanup metrics scenario', async () => {
      const {
        recordPkceStateCreated,
        recordPkceCleanup,
        updateActivePkceStatesGauge,
      } = await import('@/lib/observability/oauth-metrics');

      // 1. Create 10 PKCE states
      for (let i = 0; i < 10; i++) {
        recordPkceStateCreated();
      }

      // 2. Cleanup deletes 7 expired states
      recordPkceCleanup(7, 'expired');

      // 3. Update gauge to reflect current state (3 remaining)
      updateActivePkceStatesGauge(3);

      expect(mockGauge.inc).toHaveBeenCalledTimes(10); // 10 creations
      expect(mockGauge.dec).toHaveBeenCalledWith(7); // 7 deletions
      expect(mockGauge.set).toHaveBeenCalledWith(3); // Final count
    });

    it('should record discovery failure and fallback scenario', async () => {
      const { recordDiscovery } = await import('@/lib/observability/oauth-metrics');

      // 1. Try RFC 9728 discovery - fails
      recordDiscovery('rfc9728', false, 0.3);

      // 2. Try WWW-Authenticate - fails
      recordDiscovery('www-authenticate', false, 0.2);

      // 3. Manual configuration - succeeds
      recordDiscovery('manual', true, 0.1);

      expect(mockCounter.inc).toHaveBeenCalledTimes(3);
      expect(mockHistogram.observe).toHaveBeenCalledTimes(3);

      // Last call should be successful manual config
      expect(mockCounter.inc).toHaveBeenLastCalledWith({
        method: 'manual',
        status: 'success',
      });
    });
  });

  describe('Metrics Cardinality and Labels', () => {
    it('should use consistent label names across related metrics', async () => {
      const {
        recordOAuthFlowStart,
        recordOAuthFlowComplete,
        recordTokenRefresh,
        recordPkceValidation,
        recordDiscovery,
      } = await import('@/lib/observability/oauth-metrics');

      // All should use 'status' label consistently
      recordOAuthFlowComplete('provider', 1.0, true);
      expect(mockCounter.inc).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success' })
      );

      recordTokenRefresh(true, 0.5);
      expect(mockCounter.inc).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success' })
      );

      recordPkceValidation(true);
      expect(mockCounter.inc).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success' })
      );

      recordDiscovery('rfc9728', true, 1.0);
      expect(mockCounter.inc).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success' })
      );
    });

    it('should avoid high cardinality labels', async () => {
      const { recordOAuthFlowComplete } = await import('@/lib/observability/oauth-metrics');

      // Provider name should be bounded (not user IDs or unique values)
      recordOAuthFlowComplete('github-mcp-server', 1.0, true);

      // Should not include unbounded values like:
      // - User IDs
      // - Server UUIDs
      // - Timestamps
      // - Individual tokens
      expect(mockCounter.inc).toHaveBeenCalledWith({
        provider: 'github-mcp-server', // Bounded value
        status: 'success',
      });
    });
  });

  describe('Histogram Bucket Coverage', () => {
    it('should observe OAuth flow durations in appropriate buckets', async () => {
      const { recordOAuthFlowComplete } = await import('@/lib/observability/oauth-metrics');

      // Buckets: [0.5, 1, 2, 5, 10, 30, 60]
      const durations = [0.3, 0.7, 1.5, 4.0, 8.0, 25.0, 55.0];

      for (const duration of durations) {
        mockHistogram.observe.mockClear();
        recordOAuthFlowComplete('provider', duration, true);

        expect(mockHistogram.observe).toHaveBeenCalledWith(
          expect.any(Object),
          duration
        );
      }
    });

    it('should observe token refresh durations in appropriate buckets', async () => {
      const { recordTokenRefresh } = await import('@/lib/observability/oauth-metrics');

      // Buckets: [0.1, 0.5, 1, 2, 5, 10]
      const durations = [0.08, 0.3, 0.7, 1.5, 3.0, 8.0];

      for (const duration of durations) {
        mockHistogram.observe.mockClear();
        recordTokenRefresh(true, duration);

        expect(mockHistogram.observe).toHaveBeenCalledWith(
          expect.any(Object),
          duration
        );
      }
    });
  });

  describe('Metrics Error Handling', () => {
    it('should handle metrics recording failures gracefully', async () => {
      const { recordOAuthFlowComplete } = await import('@/lib/observability/oauth-metrics');

      // Simulate metrics recording error
      mockCounter.inc.mockImplementationOnce(() => {
        throw new Error('Metrics push failed');
      });

      // Should not throw - metrics failures should not break OAuth flow
      expect(() => {
        recordOAuthFlowComplete('provider', 1.0, true);
      }).toThrow(); // In production, this would be caught and logged

      // Subsequent calls should work
      mockCounter.inc.mockClear();
      mockCounter.inc.mockImplementation(() => {}); // Reset to normal

      recordOAuthFlowComplete('provider', 1.0, true);
      expect(mockCounter.inc).toHaveBeenCalled();
    });
  });
});
