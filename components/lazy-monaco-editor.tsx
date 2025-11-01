'use client';

import { lazy, Suspense } from 'react';

import { EditorErrorBoundary } from '@/components/editor-error-boundary';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// Lazy load Monaco Editor to reduce initial bundle size
const MonacoEditor = lazy(() => 
  import('@monaco-editor/react').then(module => ({
    default: module.Editor
  }))
);

interface LazyMonacoEditorProps {
  value?: string;
  defaultValue?: string;
  language?: string;
  defaultLanguage?: string;
  theme?: string;
  onChange?: (value: string | undefined) => void;
  options?: any;
  height?: string | number;
  width?: string | number;
  className?: string;
}

// Loading skeleton component
function EditorSkeleton() {
  return (
    <div className="absolute inset-0">
      <Skeleton className="absolute inset-0" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading editor...</div>
      </div>
    </div>
  );
}

export function LazyMonacoEditor({
  value,
  defaultValue,
  language,
  defaultLanguage = 'javascript',
  theme = 'vs-dark',
  onChange,
  options,
  height = '100%',
  width = '100%',
  className,
}: LazyMonacoEditorProps) {
  return (
    <EditorErrorBoundary>
      <div
        data-testid="editor-container"
        style={{ height, width }}
        className={cn('relative', className)}
      >
        <Suspense fallback={<EditorSkeleton />}>
          <MonacoEditor
            value={value}
            defaultValue={defaultValue}
            language={language}
            defaultLanguage={defaultLanguage}
            theme={theme}
            onChange={onChange}
            options={options}
            height="100%"
            width="100%"
            className="h-full w-full"
          />
        </Suspense>
      </div>
    </EditorErrorBoundary>
  );
}
