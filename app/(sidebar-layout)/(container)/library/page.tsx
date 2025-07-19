'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

// Dynamically import the LibraryContent component to avoid blocking page load
const LibraryContent = dynamic(() => import('./LibraryContent'), {
  loading: () => (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex items-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span>Loading library...</span>
      </div>
    </div>
  ),
  ssr: false, // Disable SSR for this component to avoid server-side issues
});

export default function LibraryPage() {
  return <LibraryContent />;
}