import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConsoleCapture } from '@/lib/utils/console-capture';

describe('ConsoleCapture', () => {
  let capture: ConsoleCapture;
  let originalConsole: {
    log: typeof console.log;
    error: typeof console.error;
    warn: typeof console.warn;
    info: typeof console.info;
    debug: typeof console.debug;
  };

  beforeEach(() => {
    // Save original console methods
    originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug,
    };
    
    capture = new ConsoleCapture();
  });

  afterEach(() => {
    // Restore original console methods
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
    console.info = originalConsole.info;
    console.debug = originalConsole.debug;
  });

  describe('Sensitive Data Sanitization', () => {
    it('should redact API keys in strings', () => {
      capture.start();
      console.log('My API key is sk-1234567890abcdefghijklmnopqrstuvwxyzABCDEF');
      const logs = capture.stop();
      
      expect(logs[0]).toContain('[REDACTED]');
      expect(logs[0]).not.toContain('sk-1234567890');
    });

    it('should redact bearer tokens', () => {
      capture.start();
      console.log('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      const logs = capture.stop();
      
      expect(logs[0]).toContain('[REDACTED]');
      expect(logs[0]).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    it('should redact sensitive keys in objects', () => {
      capture.start();
      console.log({
        username: 'john',
        password: 'secret123',
        apiKey: 'test-key-12345',
        data: 'normal data'
      });
      const logs = capture.stop();
      
      const parsedLog = JSON.parse(logs[0]);
      expect(parsedLog.password).toBe('[REDACTED]');
      expect(parsedLog.apiKey).toBe('[REDACTED]');
      expect(parsedLog.username).toBe('john');
      expect(parsedLog.data).toBe('normal data');
    });

    it('should handle nested objects with sensitive data', () => {
      capture.start();
      console.log({
        user: {
          name: 'Alice',
          credentials: {
            password: 'secret',
            token: 'Bearer abc123def456',
            oauth: {
              client_secret: 'oauth-secret-key',
              redirect_uri: 'https://example.com'
            }
          }
        }
      });
      const logs = capture.stop();
      
      const parsedLog = JSON.parse(logs[0]);
      expect(parsedLog.user.name).toBe('Alice');
      // The entire credentials object gets redacted because its key contains sensitive pattern
      expect(parsedLog.user.credentials).toBe('[REDACTED]');
    });

    it('should handle arrays with sensitive data', () => {
      capture.start();
      console.log([
        'normal string',
        'api_key: sk-test123456789',
        { secret: 'hidden', public: 'visible' },
        'password=mypassword123'
      ]);
      const logs = capture.stop();
      
      const parsedLog = JSON.parse(logs[0]);
      expect(parsedLog[0]).toBe('normal string');
      expect(parsedLog[1]).toContain('[REDACTED]');
      expect(parsedLog[1]).not.toContain('sk-test123456789');
      expect(parsedLog[2].secret).toBe('[REDACTED]');
      expect(parsedLog[2].public).toBe('visible');
      expect(parsedLog[3]).toContain('[REDACTED]');
      expect(parsedLog[3]).not.toContain('mypassword123');
    });

    it('should handle circular references gracefully', () => {
      const obj: any = { name: 'test' };
      obj.circular = obj;
      obj.password = 'secret';
      
      capture.start();
      console.log(obj);
      const logs = capture.stop();
      
      expect(logs[0]).toContain('[Object');
      expect(logs[0]).toContain('circular');
    });

    it('should handle non-serializable objects', () => {
      capture.start();
      console.log({
        func: function() { return 'test'; },
        symbol: Symbol('test'),
        password: 'secret123'
      });
      const logs = capture.stop();
      
      // Functions and symbols are filtered out during JSON.stringify,
      // but password still gets redacted
      const parsedLog = JSON.parse(logs[0]);
      expect(parsedLog.password).toBe('[REDACTED]');
      expect(parsedLog.func).toBeUndefined(); // functions are not serialized
      expect(parsedLog.symbol).toBeUndefined(); // symbols are not serialized
    });

    it('should sanitize multiple argument types', () => {
      capture.start();
      console.log(
        'Text with token=abc123xyz',
        42,
        { apiKey: 'secret' },
        null,
        undefined,
        true
      );
      const logs = capture.stop();
      
      expect(logs[0]).toContain('[REDACTED]');
      expect(logs[0]).toContain('42');
      expect(logs[0]).toContain('null');
      expect(logs[0]).toContain('undefined');
      expect(logs[0]).toContain('true');
    });
  });

  describe('Console Method Overrides', () => {
    it('should capture log messages with correct prefix', () => {
      capture.start();
      console.log('test message');
      const logs = capture.stop();
      
      expect(logs[0]).toBe('test message');
    });

    it('should capture error messages with [ERROR] prefix', () => {
      capture.start();
      console.error('error message');
      const logs = capture.stop();
      
      expect(logs[0]).toBe('[ERROR] error message');
    });

    it('should capture warn messages with [WARN] prefix', () => {
      capture.start();
      console.warn('warning message');
      const logs = capture.stop();
      
      expect(logs[0]).toBe('[WARN] warning message');
    });

    it('should capture info messages with [INFO] prefix', () => {
      capture.start();
      console.info('info message');
      const logs = capture.stop();
      
      expect(logs[0]).toBe('[INFO] info message');
    });

    it('should capture debug messages with [DEBUG] prefix', () => {
      capture.start();
      console.debug('debug message');
      const logs = capture.stop();
      
      expect(logs[0]).toBe('[DEBUG] debug message');
    });

    it('should restore original console methods after stop', () => {
      capture.start();
      const capturedLog = console.log;
      capture.stop();
      
      expect(console.log).toBe(originalConsole.log);
      expect(console.log).not.toBe(capturedLog);
    });
  });

  describe('Static Helper Methods', () => {
    it('should capture async function output', async () => {
      const asyncFn = async () => {
        console.log('async output');
        console.log({ secret: 'password123' });
        return 'result';
      };
      
      const { result, output } = await ConsoleCapture.captureAsync(asyncFn);
      
      expect(result).toBe('result');
      expect(output).toHaveLength(2);
      expect(output[0]).toBe('async output');
      expect(output[1]).toContain('[REDACTED]');
    });

    it('should capture sync function output', () => {
      const syncFn = () => {
        console.log('sync output');
        console.warn('warning');
        return 42;
      };
      
      const { result, output } = ConsoleCapture.capture(syncFn);
      
      expect(result).toBe(42);
      expect(output).toHaveLength(2);
      expect(output[0]).toBe('sync output');
      expect(output[1]).toBe('[WARN] warning');
    });

    it('should handle errors in async functions', async () => {
      const errorFn = async () => {
        console.log('before error');
        throw new Error('test error');
      };
      
      const { result, output } = await ConsoleCapture.captureAsync(errorFn);
      
      expect(result).toBeNull();
      expect(output).toContain('before error');
      expect(output[output.length - 1]).toContain('[ERROR] test error');
    });

    it('should handle errors in sync functions', () => {
      const errorFn = () => {
        console.log('before error');
        throw new Error('sync error');
      };
      
      const { result, output } = ConsoleCapture.capture(errorFn);
      
      expect(result).toBeNull();
      expect(output).toContain('before error');
      expect(output[output.length - 1]).toContain('[ERROR] sync error');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty arguments', () => {
      capture.start();
      console.log();
      const logs = capture.stop();
      
      expect(logs[0]).toBe('');
    });

    it('should handle very long strings with multiple sensitive patterns', () => {
      const longString = 'Start ' + 
        'apikey=12345678901234567890 ' +
        'middle text ' +
        'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 ' +
        'more text ' +
        'password: supersecret ' +
        'end';
      
      capture.start();
      console.log(longString);
      const logs = capture.stop();
      
      expect(logs[0]).toContain('Start');
      expect(logs[0]).toContain('[REDACTED]');
      expect(logs[0]).toContain('middle text');
      expect(logs[0]).toContain('more text');
      expect(logs[0]).toContain('end');
      expect(logs[0]).not.toContain('12345678901234567890');
      expect(logs[0]).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(logs[0]).not.toContain('supersecret');
    });

    it('should handle mixed case sensitive keys', () => {
      capture.start();
      console.log({
        PASSWORD: 'upper',
        Password: 'mixed',
        password: 'lower',
        API_KEY: 'upper_snake',
        ApiKey: 'pascal',
        apikey: 'lower_no_sep'
      });
      const logs = capture.stop();
      
      const parsedLog = JSON.parse(logs[0]);
      expect(parsedLog.PASSWORD).toBe('[REDACTED]');
      expect(parsedLog.Password).toBe('[REDACTED]');
      expect(parsedLog.password).toBe('[REDACTED]');
      expect(parsedLog.API_KEY).toBe('[REDACTED]');
      expect(parsedLog.ApiKey).toBe('[REDACTED]');
      expect(parsedLog.apikey).toBe('[REDACTED]');
    });
  });
});