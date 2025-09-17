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
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error boundary caught:', error, errorInfo);
    }

    // In production, you could send this to an error reporting service
    // Example: sendToErrorReporting(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
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
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details className="mb-4 text-left max-w-2xl">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                View error details
              </summary>
              <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto">
                {this.state.error.toString()}
                {this.state.error.stack && '\n\n' + this.state.error.stack}
              </pre>
            </details>
          )}
          <Button onClick={this.handleReset} variant="outline" size="sm">
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}