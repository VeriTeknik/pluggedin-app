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
   * Format console arguments into a single string
   */
  private formatMessage(args: any[]): string {
    return args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
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