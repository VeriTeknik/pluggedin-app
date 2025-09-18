import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withErrorBoundary } from '@/app/(sidebar-layout)/(container)/library/components/withErrorBoundary';

// Test component that can throw an error
const TestComponent = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error from component');
  }
  return <div>Test Component Content</div>;
};

describe('withErrorBoundary', () => {
  // Suppress console.error for these tests
  const originalError = console.error;
  beforeAll(() => {
    console.error = vi.fn();
  });

  afterAll(() => {
    console.error = originalError;
  });

  it('should render the wrapped component when there is no error', () => {
    const WrappedComponent = withErrorBoundary(TestComponent);
    render(<WrappedComponent shouldThrow={false} />);

    expect(screen.getByText('Test Component Content')).toBeInTheDocument();
  });

  it('should show error UI when wrapped component throws', () => {
    const WrappedComponent = withErrorBoundary(TestComponent);
    render(<WrappedComponent shouldThrow={true} />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test error from component')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
  });

  it('should use custom fallback when provided', () => {
    const customFallback = <div>Custom Error UI</div>;
    const WrappedComponent = withErrorBoundary(TestComponent, customFallback);

    render(<WrappedComponent shouldThrow={true} />);

    expect(screen.getByText('Custom Error UI')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('should set proper display name', () => {
    const NamedComponent = () => <div>Named</div>;
    NamedComponent.displayName = 'MyComponent';

    const WrappedComponent = withErrorBoundary(NamedComponent);
    expect(WrappedComponent.displayName).toBe('withErrorBoundary(MyComponent)');

    const UnnamedComponent = () => <div>Unnamed</div>;
    const WrappedUnnamed = withErrorBoundary(UnnamedComponent);
    expect(WrappedUnnamed.displayName).toBe('withErrorBoundary(UnnamedComponent)');
  });

  it('should pass props correctly to wrapped component', () => {
    const PropsComponent = ({ message, count }: { message: string; count: number }) => (
      <div>
        {message} - {count}
      </div>
    );

    const WrappedComponent = withErrorBoundary(PropsComponent);
    render(<WrappedComponent message="Hello" count={42} shouldThrow={false} />);

    expect(screen.getByText('Hello - 42')).toBeInTheDocument();
  });
});