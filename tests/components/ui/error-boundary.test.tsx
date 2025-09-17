import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import React from 'react';
import '@testing-library/jest-dom';

// Component that throws an error
const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <div>No error content</div>;
};

// Component that throws during render
const ThrowOnRender = () => {
  throw new Error('Render error');
};

// Component that throws async error
const ThrowAsyncError = () => {
  React.useEffect(() => {
    throw new Error('Async error');
  }, []);
  return <div>Async component</div>;
};

describe('ErrorBoundary', () => {
  let originalEnv: string | undefined;
  let consoleSpy: any;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    // Suppress console.error for cleaner test output
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    consoleSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Test content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('catches errors and displays fallback in production', () => {
    process.env.NODE_ENV = 'production';

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Please refresh the page to try again.')).toBeInTheDocument();
  });

  it('displays error details in development mode', () => {
    process.env.NODE_ENV = 'development';

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Error: Test error message')).toBeInTheDocument();
    expect(screen.getByText('Error Details')).toBeInTheDocument();
  });

  it('shows stack trace in development mode', () => {
    process.env.NODE_ENV = 'development';

    render(
      <ErrorBoundary>
        <ThrowOnRender />
      </ErrorBoundary>
    );

    const errorDetails = screen.getByText('Error: Render error');
    expect(errorDetails).toBeInTheDocument();

    // Check for stack trace container
    const preElements = document.querySelectorAll('pre');
    expect(preElements.length).toBeGreaterThan(0);
  });

  it('recovers when error is resolved', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Re-render without error
    rerender(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('No error content')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('handles multiple consecutive errors', () => {
    process.env.NODE_ENV = 'production';

    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Try with different error
    const DifferentError = () => {
      throw new Error('Different error');
    };

    rerender(
      <ErrorBoundary>
        <DifferentError />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('logs errors to console in development', () => {
    process.env.NODE_ENV = 'development';

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(consoleSpy).toHaveBeenCalled();
  });

  it('applies correct styling classes', () => {
    process.env.NODE_ENV = 'production';

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const container = document.querySelector('.min-h-\\[400px\\]');
    expect(container).toBeInTheDocument();
    expect(container).toHaveClass('flex', 'items-center', 'justify-center');
  });

  it('renders error icon', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    // Check for alert triangle icon presence
    const icon = document.querySelector('[class*="text-red"]');
    expect(icon).toBeInTheDocument();
  });

  it('handles errors with no message', () => {
    const ErrorWithoutMessage = () => {
      throw new Error();
    };

    process.env.NODE_ENV = 'development';

    render(
      <ErrorBoundary>
        <ErrorWithoutMessage />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Error:')).toBeInTheDocument();
  });

  it('handles non-Error objects being thrown', () => {
    const ThrowString = () => {
      throw 'String error';
    };

    render(
      <ErrorBoundary>
        <ThrowString />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('provides fallback prop option', () => {
    const CustomFallback = <div>Custom error UI</div>;

    render(
      <ErrorBoundary fallback={CustomFallback}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom error UI')).toBeInTheDocument();
  });

  it('maintains error boundary state isolation', () => {
    render(
      <div>
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
        <ErrorBoundary>
          <div>Working component</div>
        </ErrorBoundary>
      </div>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Working component')).toBeInTheDocument();
  });

  it('handles errors from nested components', () => {
    const Parent = ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    );

    const DeepChild = () => {
      throw new Error('Deep error');
    };

    render(
      <ErrorBoundary>
        <Parent>
          <Parent>
            <DeepChild />
          </Parent>
        </Parent>
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('preserves error info for telemetry', () => {
    process.env.NODE_ENV = 'development';

    const errorInfo = { componentStack: 'Test stack' };
    const error = new Error('Telemetry test');

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    // Verify error boundary would have access to error info for telemetry
    expect(consoleSpy).toHaveBeenCalled();
  });
});