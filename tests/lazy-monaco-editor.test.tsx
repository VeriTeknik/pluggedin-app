import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { LazyMonacoEditor } from '@/components/lazy-monaco-editor';

// Mock the Monaco Editor to avoid loading the actual editor in tests
vi.mock('@monaco-editor/react', () => ({
  Editor: vi.fn(({ value, defaultValue, onChange, theme, language, defaultLanguage }) => {
    return (
      <div data-testid="monaco-editor">
        <div>Theme: {theme}</div>
        <div>Language: {language || defaultLanguage}</div>
        <div>Value: {value || defaultValue}</div>
      </div>
    );
  }),
}));

// Mock the error boundary
vi.mock('@/components/editor-error-boundary', () => ({
  EditorErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('LazyMonacoEditor', () => {
  it('should render loading skeleton initially', () => {
    render(<LazyMonacoEditor />);
    
    expect(screen.getByText('Loading editor...')).toBeInTheDocument();
  });

  it('should render with default props', async () => {
    render(<LazyMonacoEditor />);
    
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Theme: vs-dark')).toBeInTheDocument();
    expect(screen.getByText('Language: javascript')).toBeInTheDocument();
  });

  it('should support controlled mode with value prop', async () => {
    const testValue = 'const hello = "world";';
    
    render(<LazyMonacoEditor value={testValue} language="typescript" />);
    
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
    });
    
    expect(screen.getByText(`Value: ${testValue}`)).toBeInTheDocument();
    expect(screen.getByText('Language: typescript')).toBeInTheDocument();
  });

  it('should support uncontrolled mode with defaultValue prop', async () => {
    const defaultValue = 'function test() { return true; }';
    
    render(<LazyMonacoEditor defaultValue={defaultValue} defaultLanguage="javascript" />);
    
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
    });
    
    expect(screen.getByText(`Value: ${defaultValue}`)).toBeInTheDocument();
    expect(screen.getByText('Language: javascript')).toBeInTheDocument();
  });

  it('should pass through custom theme', async () => {
    render(<LazyMonacoEditor theme="vs-light" />);
    
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Theme: vs-light')).toBeInTheDocument();
  });

  it('should render with custom dimensions', () => {
    const { getByTestId } = render(
      <LazyMonacoEditor height="500px" width="800px" />
    );

    const container = getByTestId('editor-container');
    expect(container).toBeInTheDocument();
    expect(container.style.height).toBe('500px');
    expect(container.style.width).toBe('800px');
  });

  it('should handle both value and language for controlled mode', async () => {
    render(
      <LazyMonacoEditor 
        value="console.log('test');" 
        language="javascript"
        theme="vs-dark"
      />
    );
    
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
    });
    
    expect(screen.getByText("Value: console.log('test');")).toBeInTheDocument();
    expect(screen.getByText('Language: javascript')).toBeInTheDocument();
  });

  it('should handle both defaultValue and defaultLanguage for uncontrolled mode', async () => {
    render(
      <LazyMonacoEditor 
        defaultValue="print('hello')" 
        defaultLanguage="python"
      />
    );
    
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
    });
    
    expect(screen.getByText("Value: print('hello')")).toBeInTheDocument();
    expect(screen.getByText('Language: python')).toBeInTheDocument();
  });
});
