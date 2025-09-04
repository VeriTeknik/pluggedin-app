/**
 * Utility for capturing console output during function execution
 */
export class ConsoleCapture {
  private logs: string[] = [];
  private originalConsole: {
    log: typeof console.log;
    error: typeof console.error;
    warn: typeof console.warn;
    info: typeof console.info;
    debug: typeof console.debug;
  };

  // Sensitive key patterns for redaction
  private static readonly SENSITIVE_KEYS = [
    'password', 'token', 'apikey', 'api_key', 'secret', 'auth', 'authorization',
    'bearer', 'credential', 'private_key', 'privatekey', 'oauth'
  ];

  // Sensitive value patterns for redaction
  private static readonly SENSITIVE_PATTERNS: RegExp[] = [
    /\b[A-Za-z0-9]{20,}\b/g,       // Generic long alphanumeric strings (API keys)
    /sk-[A-Za-z0-9]{48,}/g,        // OpenAI API keys
    /pk-[A-Za-z0-9]{48,}/g,        // Anthropic API keys
    /Bearer\s+[A-Za-z0-9\-_\.]+/gi, // Bearer tokens
    /token[=:\s]+[A-Za-z0-9\-_\.]+/gi, // Token patterns
    /api[_-]?key[=:\s]+[A-Za-z0-9\-_\.]+/gi, // API key patterns
    /password[=:\s]+[^\s]+/gi       // Password patterns
  ];

  constructor() {
    this.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug,
    };
  }

  /**
   * Start capturing console output
   */
  start(): void {
    this.logs = [];

    // Override console methods
    console.log = (...args: any[]) => {
      const message = this.formatMessage(args);
      this.logs.push(message);
      this.originalConsole.log(...args);
    };

    console.error = (...args: any[]) => {
      const message = this.formatMessage(args);
      this.logs.push(`[ERROR] ${message}`);
      this.originalConsole.error(...args);
    };

    console.warn = (...args: any[]) => {
      const message = this.formatMessage(args);
      this.logs.push(`[WARN] ${message}`);
      this.originalConsole.warn(...args);
    };

    console.info = (...args: any[]) => {
      const message = this.formatMessage(args);
      this.logs.push(`[INFO] ${message}`);
      this.originalConsole.info(...args);
    };

    console.debug = (...args: any[]) => {
      const message = this.formatMessage(args);
      this.logs.push(`[DEBUG] ${message}`);
      this.originalConsole.debug(...args);
    };
  }

  /**
   * Stop capturing and restore original console methods
   */
  stop(): string[] {
    // Restore original console methods
    console.log = this.originalConsole.log;
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
    console.info = this.originalConsole.info;
    console.debug = this.originalConsole.debug;

    return this.logs;
  }

  /**
   * Deep sanitizes objects (keys + string values) using JSON replacer
   */
  private sanitize(obj: any): string {
    return JSON.stringify(obj, (key, value) => {
      // Check for sensitive keys
      if (ConsoleCapture.SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k))) {
        return '[REDACTED]';
      }
      // Apply pattern matching for string values
      if (typeof value === 'string') {
        return ConsoleCapture.SENSITIVE_PATTERNS
          .reduce((s, regex) => s.replace(regex, '[REDACTED]'), value);
      }
      return value;
    }, 2);
  }

  /**
   * Format console arguments into a single string with sensitive data filtering
   */
  private formatMessage(args: any[]): string {
    return args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return this.sanitize(arg);
        } catch {
          return '[Object - could not stringify]';
        }
      }
      // Non-object strings still need pattern redaction
      const str = String(arg);
      return ConsoleCapture.SENSITIVE_PATTERNS
        .reduce((s, regex) => s.replace(regex, '[REDACTED]'), str);
    }).join(' ');
  }

  /**
   * Capture console output during async function execution
   */
  static async captureAsync<T>(
    fn: () => Promise<T>
  ): Promise<{ result: T | null; output: string[] }> {
    const capture = new ConsoleCapture();
    capture.start();
    
    try {
      const result = await fn();
      const output = capture.stop();
      return { result, output };
    } catch (error) {
      const output = capture.stop();
      // Add error to output
      if (error instanceof Error) {
        output.push(`[ERROR] ${error.message}`);
      }
      return { result: null, output };
    }
  }

  /**
   * Capture console output during sync function execution
   */
  static capture<T>(fn: () => T): { result: T | null; output: string[] } {
    const capture = new ConsoleCapture();
    capture.start();
    
    try {
      const result = fn();
      const output = capture.stop();
      return { result, output };
    } catch (error) {
      const output = capture.stop();
      // Add error to output
      if (error instanceof Error) {
        output.push(`[ERROR] ${error.message}`);
      }
      return { result: null, output };
    }
  }
}