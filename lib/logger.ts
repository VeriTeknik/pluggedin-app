/**
 * Simple logger utility for the application
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: any;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';

  private log(level: LogLevel, message: string, data?: any) {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      data,
    };

    // In development, use console methods
    if (this.isDevelopment) {
      const logData = data ? ` ${JSON.stringify(data)}` : '';
      const logMessage = `[${entry.timestamp}] ${level.toUpperCase()}: ${message}${logData}`;

      switch (level) {
        case 'error':
          console.error(logMessage);
          break;
        case 'warn':
          console.warn(logMessage);
          break;
        case 'debug':
          console.debug(logMessage);
          break;
        default:
          console.log(logMessage);
      }
    } else {
      // In production, use structured logging
      console.log(JSON.stringify(entry));
    }
  }

  info(message: string, data?: any) {
    this.log('info', message, data);
  }

  warn(message: string, data?: any) {
    this.log('warn', message, data);
  }

  error(message: string, data?: any) {
    this.log('error', message, data);
  }

  debug(message: string, data?: any) {
    if (this.isDevelopment) {
      this.log('debug', message, data);
    }
  }
}

export const logger = new Logger();