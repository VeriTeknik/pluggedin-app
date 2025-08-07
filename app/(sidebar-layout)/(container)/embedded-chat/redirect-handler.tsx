'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface RedirectHandlerProps {
  redirectTo: string;
  message?: string;
}

export function RedirectHandler({ redirectTo, message = 'Redirecting...' }: RedirectHandlerProps) {
  const router = useRouter();

  useEffect(() => {
    // Small delay to show the loading state
    const timer = setTimeout(() => {
      router.push(redirectTo);
    }, 100);

    return () => clearTimeout(timer);
  }, [redirectTo, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}