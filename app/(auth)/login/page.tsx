'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthLayout } from '@/components/auth/auth-layout';

function LoginContent() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  
  return (
    <div className="animate-in fade-in duration-500">
      <AuthLayout type="login" returnTo={returnTo} />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="animate-in fade-in duration-500">
        <AuthLayout type="login" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
} 