'use client';

import { AuthForm } from '@/components/auth/auth-form';

export default function ResetPasswordPage() {
  return (
    <div className="animate-in fade-in duration-500">
      <AuthForm type="reset-password" />
    </div>
  );
} 