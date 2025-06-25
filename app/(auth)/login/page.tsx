'use client';

import { AuthForm } from '@/components/auth/auth-form';

export default function LoginPage() {
  return (
    <div className="animate-in fade-in duration-500">
      <AuthForm type="login" />
    </div>
  );
} 