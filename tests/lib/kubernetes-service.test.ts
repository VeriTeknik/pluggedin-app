/**
 * Tests for kubernetes-service utility functions
 * Tests namespace validation for security
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Save original env
const originalEnv = { ...process.env };

describe('kubernetes-service', () => {
  beforeEach(() => {
    // Reset environment
    vi.resetModules();
  });

  afterEach(() => {
    // Restore environment
    process.env = { ...originalEnv };
  });

  describe('validateNamespace', () => {
    it('should accept default allowed namespaces', async () => {
      // Set default allowed namespaces
      process.env.K8S_ALLOWED_NAMESPACES = 'agents,agents-dev,agents-staging';

      // Import fresh module with new env
      const { validateNamespace } = await import('@/lib/services/kubernetes-service');

      expect(validateNamespace('agents')).toBeNull();
      expect(validateNamespace('agents-dev')).toBeNull();
      expect(validateNamespace('agents-staging')).toBeNull();
    });

    it('should reject non-allowed namespaces', async () => {
      process.env.K8S_ALLOWED_NAMESPACES = 'agents,agents-dev';

      const { validateNamespace } = await import('@/lib/services/kubernetes-service');

      const result = validateNamespace('kube-system');
      expect(result).not.toBeNull();
      expect(result).toContain('not allowed');
      expect(result).toContain('kube-system');
    });

    it('should reject empty namespace', async () => {
      process.env.K8S_ALLOWED_NAMESPACES = 'agents';

      const { validateNamespace } = await import('@/lib/services/kubernetes-service');

      expect(validateNamespace('')).toContain('empty');
    });

    it('should reject whitespace namespace', async () => {
      process.env.K8S_ALLOWED_NAMESPACES = 'agents';

      const { validateNamespace } = await import('@/lib/services/kubernetes-service');

      expect(validateNamespace('   ')).toContain('empty');
    });

    it('should use custom K8S_ALLOWED_NAMESPACES', async () => {
      process.env.K8S_ALLOWED_NAMESPACES = 'custom-ns,another-ns';

      const { validateNamespace } = await import('@/lib/services/kubernetes-service');

      expect(validateNamespace('custom-ns')).toBeNull();
      expect(validateNamespace('another-ns')).toBeNull();
      expect(validateNamespace('agents')).toContain('not allowed'); // Default not included
    });

    it('should handle single allowed namespace', async () => {
      process.env.K8S_ALLOWED_NAMESPACES = 'single-ns';

      const { validateNamespace } = await import('@/lib/services/kubernetes-service');

      expect(validateNamespace('single-ns')).toBeNull();
      expect(validateNamespace('other-ns')).toContain('not allowed');
    });

    it('should prevent path traversal attempts', async () => {
      process.env.K8S_ALLOWED_NAMESPACES = 'agents';

      const { validateNamespace } = await import('@/lib/services/kubernetes-service');

      // These should all be rejected as they're not in the allowlist
      expect(validateNamespace('../kube-system')).toContain('not allowed');
      expect(validateNamespace('agents/../kube-system')).toContain('not allowed');
      expect(validateNamespace('agents/../../etc')).toContain('not allowed');
    });

    it('should be case-sensitive', async () => {
      process.env.K8S_ALLOWED_NAMESPACES = 'agents';

      const { validateNamespace } = await import('@/lib/services/kubernetes-service');

      expect(validateNamespace('agents')).toBeNull();
      expect(validateNamespace('AGENTS')).toContain('not allowed');
      expect(validateNamespace('Agents')).toContain('not allowed');
    });
  });
});
