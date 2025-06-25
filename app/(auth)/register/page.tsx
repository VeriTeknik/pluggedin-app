'use client';

import { AuthForm } from '@/components/auth/auth-form';

export default function RegisterPage() {
  return (
    <div className="animate-in fade-in duration-500">
      <AuthForm type="register" />
    </div>
  );
} 