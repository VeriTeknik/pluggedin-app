import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { debugLog, debugError, debugWarn } from '@/lib/debug-log';

describe('Debug Logging', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  beforeEach(() => {
    console.log = vi.fn();
    console.error = vi.fn();
    console.warn = vi.fn();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  });

  describe('debugLog', () => {
    it('should log messages in development mode', () => {
      process.env.NODE_ENV = 'development';
      
      debugLog('Test message', { data: 'test' });
      
      expect(console.log).toHaveBeenCalledWith('[DEBUG] Test message', { data: 'test' });
    });

    it('should not log messages in production mode', () => {
      process.env.NODE_ENV = 'production';
      
      debugLog('Test message');
      
      expect(console.log).not.toHaveBeenCalled();
    });

    it('should handle multiple arguments', () => {
      process.env.NODE_ENV = 'development';
      
      debugLog('Multiple args', 1, 'two', { three: 3 });
      
      expect(console.log).toHaveBeenCalledWith('[DEBUG] Multiple args', 1, 'two', { three: 3 });
    });
  });

  describe('debugError', () => {
    it('should log errors in development mode', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Test error');
      
      debugError('Error occurred', error);
      
      expect(console.error).toHaveBeenCalledWith('[ERROR] Error occurred', error);
    });

    it('should not log errors in production mode', () => {
      process.env.NODE_ENV = 'production';
      
      debugError('Error occurred');
      
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should handle error without additional data', () => {
      process.env.NODE_ENV = 'development';
      
      debugError('Simple error');
      
      expect(console.error).toHaveBeenCalledWith('[ERROR] Simple error', undefined);
    });
  });

  describe('debugWarn', () => {
    it('should log warnings in development mode', () => {
      process.env.NODE_ENV = 'development';
      
      debugWarn('Warning message', 'additional info');
      
      expect(console.warn).toHaveBeenCalledWith('[WARN] Warning message', 'additional info');
    });

    it('should not log warnings in production mode', () => {
      process.env.NODE_ENV = 'production';
      
      debugWarn('Warning message');
      
      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe('Runtime environment changes', () => {
    it('should respond to runtime environment changes', () => {
      process.env.NODE_ENV = 'production';
      debugLog('Should not log');
      expect(console.log).not.toHaveBeenCalled();
      
      process.env.NODE_ENV = 'development';
      debugLog('Should log');
      expect(console.log).toHaveBeenCalledWith('[DEBUG] Should log');
    });
  });
});