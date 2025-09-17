'use client';

import React, { Component, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  sectionName?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorId?: string;
}

// Error telemetry service
class ErrorTelemetry {
  private static instance: ErrorTelemetry;
  private queue: any[] = [];
  private isProcessing = false;

  static getInstance(): ErrorTelemetry {
    if (!ErrorTelemetry.instance) {
      ErrorTelemetry.instance = new ErrorTelemetry();
    }
    return ErrorTelemetry.instance;
  }

  async reportError(error: Error, errorInfo: React.ErrorInfo, context?: any) {
    const errorId = this.generateErrorId();
    const errorReport = {
      id: errorId,
      timestamp: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      viewport: typeof window !== 'undefined' ? {
        width: window.innerWidth,
        height: window.innerHeight,
      } : undefined,
      screen: typeof window !== 'undefined' ? {
        width: window.screen.width,
        height: window.screen.height,
        pixelRatio: window.devicePixelRatio,
      } : undefined,
      context: {
        ...context,
        NODE_ENV: process.env.NODE_ENV,
        buildTime: process.env.NEXT_PUBLIC_BUILD_TIME,
        version: process.env.NEXT_PUBLIC_APP_VERSION,
      },
    };

    // In production, send to error tracking service
    if (process.env.NODE_ENV === 'production') {
      this.queue.push(errorReport);
      this.processQueue();

      // Also log to console in production for debugging
      console.error('[Error Boundary]', errorReport);
    } else {
      // In development, just log to console
      console.error('Error Report:', errorReport);
    }

    return errorId;
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    const batch = this.queue.splice(0, 10); // Process up to 10 errors at a time

    try {
      // Send to your error tracking service
      if (process.env.NEXT_PUBLIC_ERROR_TRACKING_ENDPOINT) {
        await fetch(process.env.NEXT_PUBLIC_ERROR_TRACKING_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ errors: batch }),
        });
      }

      // Send to Vercel Analytics if available
      if (typeof window !== 'undefined' && (window as any).va) {
        batch.forEach(error => {
          (window as any).va('event', {
            name: 'error-boundary',
            data: error,
          });
        });
      }

      // Log to browser's reporting API if available
      if (typeof window !== 'undefined' && 'ReportingObserver' in window) {
        const observer = new (window as any).ReportingObserver((reports: any[]) => {
          console.log('Reporting Observer:', reports);
        });
        observer.observe();
      }
    } catch (e) {
      console.error('Failed to send error telemetry:', e);
      // Re-add failed items to queue for retry
      this.queue.unshift(...batch);
    } finally {
      this.isProcessing = false;

      // Process remaining items with exponential backoff
      if (this.queue.length > 0) {
        setTimeout(() => this.processQueue(), Math.min(5000 * Math.pow(2, this.queue.length / 10), 60000));
      }
    }
  }

  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export class ErrorBoundary extends Component<Props, State> {
  private telemetry = ErrorTelemetry.getInstance();

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  async componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Report to telemetry service
    const errorId = await this.telemetry.reportError(error, errorInfo, {
      sectionName: this.props.sectionName,
    });

    this.setState({ errorId });

    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error boundary caught:', error, errorInfo);
    }

    // Track with Web Vitals if critical error
    if (typeof window !== 'undefined' && error.message.includes('Critical')) {
      // This will be picked up by Web Vitals reporter
      window.dispatchEvent(new CustomEvent('critical-error', {
        detail: { error: error.message, errorId }
      }));
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorId: undefined });
  };

  handleReportError = () => {
    if (this.state.errorId) {
      // Open error report form or copy error ID
      if (navigator.clipboard) {
        navigator.clipboard.writeText(this.state.errorId);
        alert(`Error ID copied to clipboard: ${this.state.errorId}`);
      }
    }
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }

      // Default fallback UI
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
          <div className="rounded-full bg-destructive/10 p-3 mb-4">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h3 className="text-lg font-semibold mb-2">
            {this.props.sectionName
              ? `Error loading ${this.props.sectionName}`
              : 'Something went wrong'}
          </h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md">
            We encountered an error while loading this section. Please try refreshing the page or
            contact support if the problem persists.
          </p>

          {/* Error ID for production error tracking */}
          {process.env.NODE_ENV === 'production' && this.state.errorId && (
            <p className="text-xs text-muted-foreground mb-4">
              Error ID: <code className="font-mono">{this.state.errorId}</code>
            </p>
          )}

          {/* Detailed error in development */}
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details className="mb-4 text-left max-w-2xl">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                View error details
              </summary>
              <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto">
                {this.state.error.toString()}
                {this.state.error.stack && '\n\n' + this.state.error.stack}
                {this.state.errorId && `\n\nError ID: ${this.state.errorId}`}
              </pre>
            </details>
          )}

          <div className="flex gap-2">
            <Button onClick={this.handleReset} variant="outline" size="sm">
              Try Again
            </Button>
            {process.env.NODE_ENV === 'production' && this.state.errorId && (
              <Button onClick={this.handleReportError} variant="ghost" size="sm">
                Copy Error ID
              </Button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}