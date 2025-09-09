'use client';

import { Suspense, lazy } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

// Lazy load Monaco Editor to reduce initial bundle size
const MonacoEditor = lazy(() => 
  import('@monaco-editor/react').then(module => ({
    default: module.Editor
  }))
);

interface LazyMonacoEditorProps {
  value?: string;
  language?: string;
  theme?: string;
  onChange?: (value: string | undefined) => void;
  options?: any;
  height?: string | number;
  width?: string | number;
  className?: string;
}

// Loading skeleton component
function EditorSkeleton({ height = '100%', width = '100%' }: { height?: string | number; width?: string | number }) {
  return (
    <div style={{ height, width }} className="relative">
      <Skeleton className="absolute inset-0" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading editor...</div>
      </div>
    </div>
  );
}

export function LazyMonacoEditor({
  value,
  language = 'javascript',
  theme = 'vs-dark',
  onChange,
  options,
  height = '100%',
  width = '100%',
  className,
}: LazyMonacoEditorProps) {
  return (
    <Suspense fallback={<EditorSkeleton height={height} width={width} />}>
      <MonacoEditor
        value={value}
        language={language}
        theme={theme}
        onChange={onChange}
        options={options}
        height={height}
        width={width}
        className={className}
      />
    </Suspense>
  );
}