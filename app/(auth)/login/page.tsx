'use client';

import { AuthLayout } from '@/components/auth/auth-layout';

export default function LoginPage() {
  return (
    <div className="animate-in fade-in duration-500">
      <AuthLayout type="login" />
    </div>
  );
} 