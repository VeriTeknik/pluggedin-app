'use client';

import React, { ComponentType } from 'react';

import { ErrorBoundary } from './ErrorBoundary';

/**
 * Higher-order component that wraps a component with an error boundary
 * @param Component The component to wrap
 * @param fallback Optional custom fallback UI
 * @returns The wrapped component with error boundary protection
 */
export function withErrorBoundary<P extends object>(
  Component: ComponentType<P>,
  fallback?: React.ReactNode
): ComponentType<P> {
  const WrappedComponent = (props: P) => {
    return (
      <ErrorBoundary fallback={fallback}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name || 'Component'})`;

  return WrappedComponent;
}