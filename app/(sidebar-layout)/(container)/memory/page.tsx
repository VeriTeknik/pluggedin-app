'use client';

import { Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';

import { ErrorBoundary } from './components/ErrorBoundary';

// Dynamically import the MemoryContent component to avoid blocking page load
const MemoryContent = dynamic(() => import('./MemoryContent'), {
  loading: () => (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex items-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span>Loading memory...</span>
      </div>
    </div>
  ),
  ssr: false,
});

export default function MemoryPage() {
  return (
    <ErrorBoundary>
      <MemoryContent />
    </ErrorBoundary>
  );
}
