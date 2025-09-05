import { describe, it, expect } from 'vitest';
import { validateTimeout, validateTimeouts, TIMEOUT_PRESETS } from '@/lib/timeout-validator';

describe('Timeout Validator', () => {
  describe('validateTimeout', () => {
    it('should return default value when undefined is provided', () => {
      const result = validateTimeout(undefined, TIMEOUT_PRESETS.perServer);
      expect(result).toBe(20000); // default value
    });

    it('should clamp values below minimum', () => {
      const result = validateTimeout(500, TIMEOUT_PRESETS.perServer);
      expect(result).toBe(1000); // minimum value
    });

    it('should clamp values above maximum', () => {
      const result = validateTimeout(100000, TIMEOUT_PRESETS.perServer);
      expect(result).toBe(60000); // maximum value
    });

    it('should return valid values unchanged', () => {
      const result = validateTimeout(30000, TIMEOUT_PRESETS.perServer);
      expect(result).toBe(30000);
    });

    it('should handle zero as below minimum', () => {
      const result = validateTimeout(0, TIMEOUT_PRESETS.perServer);
      expect(result).toBe(1000); // minimum value
    });

    it('should handle negative values', () => {
      const result = validateTimeout(-5000, TIMEOUT_PRESETS.perServer);
      expect(result).toBe(1000); // minimum value
    });

    it('should handle very large values', () => {
      const result = validateTimeout(Number.MAX_SAFE_INTEGER, TIMEOUT_PRESETS.total);
      expect(result).toBe(300000); // maximum value for total
    });

    it('should handle NaN by using default', () => {
      const result = validateTimeout(NaN, TIMEOUT_PRESETS.perServer);
      expect(result).toBe(20000); // default value
    });
  });

  describe('validateTimeouts', () => {
    it('should validate both timeouts with defaults', () => {
      const result = validateTimeouts({});
      expect(result).toEqual({
        perServerTimeout: 20000,
        totalTimeout: 60000
      });
    });

    it('should validate both timeouts with custom values', () => {
      const result = validateTimeouts({
        perServer: 15000,
        total: 45000
      });
      expect(result).toEqual({
        perServerTimeout: 15000,
        totalTimeout: 45000
      });
    });

    it('should clamp both timeouts when out of bounds', () => {
      const result = validateTimeouts({
        perServer: 100,
        total: 1000000
      });
      expect(result).toEqual({
        perServerTimeout: 1000,  // clamped to min
        totalTimeout: 300000     // clamped to max
      });
    });

    it('should handle partial input', () => {
      const result = validateTimeouts({
        perServer: 25000
      });
      expect(result).toEqual({
        perServerTimeout: 25000,
        totalTimeout: 60000  // default
      });
    });

    it('should handle undefined values', () => {
      const result = validateTimeouts({
        perServer: undefined,
        total: undefined
      });
      expect(result).toEqual({
        perServerTimeout: 20000,  // default
        totalTimeout: 60000      // default
      });
    });
  });

  describe('TIMEOUT_PRESETS', () => {
    it('should have valid perServer preset values', () => {
      expect(TIMEOUT_PRESETS.perServer.min).toBe(1000);
      expect(TIMEOUT_PRESETS.perServer.max).toBe(60000);
      expect(TIMEOUT_PRESETS.perServer.default).toBe(20000);
      expect(TIMEOUT_PRESETS.perServer.min).toBeLessThan(TIMEOUT_PRESETS.perServer.default);
      expect(TIMEOUT_PRESETS.perServer.default).toBeLessThan(TIMEOUT_PRESETS.perServer.max);
    });

    it('should have valid total preset values', () => {
      expect(TIMEOUT_PRESETS.total.min).toBe(5000);
      expect(TIMEOUT_PRESETS.total.max).toBe(300000);
      expect(TIMEOUT_PRESETS.total.default).toBe(60000);
      expect(TIMEOUT_PRESETS.total.min).toBeLessThan(TIMEOUT_PRESETS.total.default);
      expect(TIMEOUT_PRESETS.total.default).toBeLessThan(TIMEOUT_PRESETS.total.max);
    });

    it('should have total timeout greater than perServer timeout', () => {
      expect(TIMEOUT_PRESETS.total.max).toBeGreaterThan(TIMEOUT_PRESETS.perServer.max);
      expect(TIMEOUT_PRESETS.total.default).toBeGreaterThanOrEqual(TIMEOUT_PRESETS.perServer.default);
    });
  });

  describe('Edge Cases for Resource Exhaustion Prevention', () => {
    it('should prevent DoS with extremely high timeout requests', () => {
      // Simulating malicious user input trying to cause resource exhaustion
      const maliciousTimeouts = {
        perServer: 60000000,  // 1000 minutes
        total: 86400000       // 24 hours
      };
      
      const result = validateTimeouts(maliciousTimeouts);
      
      // Should be clamped to safe maximums
      expect(result.perServerTimeout).toBe(60000);   // 1 minute max
      expect(result.totalTimeout).toBe(300000);      // 5 minutes max
    });

    it('should handle string-like numbers by converting them', () => {
      // If someone passes a string that looks like a number
      const result = validateTimeout(
        Number('30000'),
        TIMEOUT_PRESETS.perServer
      );
      expect(result).toBe(30000);
    });

    it('should handle Infinity as maximum value', () => {
      const result = validateTimeout(Infinity, TIMEOUT_PRESETS.perServer);
      expect(result).toBe(60000); // maximum value
    });

    it('should handle -Infinity as minimum value', () => {
      const result = validateTimeout(-Infinity, TIMEOUT_PRESETS.perServer);
      expect(result).toBe(1000); // minimum value
    });

    it('should ensure minimum timeout is always positive', () => {
      // Even with custom limits, result should be positive
      const customLimits = {
        min: 100,
        max: 1000,
        default: 500
      };
      
      const result = validateTimeout(-100, customLimits);
      expect(result).toBeGreaterThan(0);
      expect(result).toBe(100); // clamped to min
    });
  });
});