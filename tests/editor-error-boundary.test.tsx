import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { EditorErrorBoundary } from '@/components/editor-error-boundary';

// Component that throws an error for testing
function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <div>No error</div>;
}

describe('EditorErrorBoundary', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalConsoleError = console.error;

  beforeEach(() => {
    // Silence console.error during tests
    console.error = vi.fn();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    console.error = originalConsoleError;
  });

  it('should render children when there is no error', () => {
    render(
      <EditorErrorBoundary>
        <div>Test content</div>
      </EditorErrorBoundary>
    );

    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('should catch errors and display error UI', () => {
    render(
      <EditorErrorBoundary>
        <ThrowError shouldThrow={true} />
      </EditorErrorBoundary>
    );

    expect(screen.getByText('Editor Failed to Load')).toBeInTheDocument();
    expect(screen.getByText('Test error message')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
  });

  it('should display generic message when error has no message', () => {
    // Create error without message
    function ThrowEmptyError() {
      throw new Error();
    }

    render(
      <EditorErrorBoundary>
        <ThrowEmptyError />
      </EditorErrorBoundary>
    );

    expect(screen.getByText('An unexpected error occurred while loading the editor.')).toBeInTheDocument();
  });

  it('should reset error state when Try Again is clicked', () => {
    const { rerender } = render(
      <EditorErrorBoundary>
        <ThrowError shouldThrow={true} />
      </EditorErrorBoundary>
    );

    // Verify error UI is shown
    expect(screen.getByText('Editor Failed to Load')).toBeInTheDocument();

    // Click Try Again
    const tryAgainButton = screen.getByRole('button', { name: 'Try Again' });
    fireEvent.click(tryAgainButton);

    // Re-render with non-throwing component
    rerender(
      <EditorErrorBoundary>
        <ThrowError shouldThrow={false} />
      </EditorErrorBoundary>
    );

    // Should show normal content
    expect(screen.getByText('No error')).toBeInTheDocument();
    expect(screen.queryByText('Editor Failed to Load')).not.toBeInTheDocument();
  });

  it('should render custom fallback when provided', () => {
    const customFallback = <div>Custom error UI</div>;

    render(
      <EditorErrorBoundary fallback={customFallback}>
        <ThrowError shouldThrow={true} />
      </EditorErrorBoundary>
    );

    expect(screen.getByText('Custom error UI')).toBeInTheDocument();
    expect(screen.queryByText('Editor Failed to Load')).not.toBeInTheDocument();
  });

  it('should log errors in development mode', () => {
    process.env.NODE_ENV = 'development';
    const consoleErrorSpy = vi.spyOn(console, 'error');

    render(
      <EditorErrorBoundary>
        <ThrowError shouldThrow={true} />
      </EditorErrorBoundary>
    );

    // componentDidCatch will call console.error
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should not log errors in production mode', () => {
    process.env.NODE_ENV = 'production';
    const consoleErrorSpy = vi.spyOn(console, 'error');

    render(
      <EditorErrorBoundary>
        <ThrowError shouldThrow={true} />
      </EditorErrorBoundary>
    );

    // Only React's internal error logging should occur, not our custom logging
    const customLogCalls = consoleErrorSpy.mock.calls.filter(
      call => call[0] === 'Editor Error:'
    );
    expect(customLogCalls).toHaveLength(0);
  });
});