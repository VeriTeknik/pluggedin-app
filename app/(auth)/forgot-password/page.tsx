'use client';

import { AuthForm } from '@/components/auth/auth-form';

export default function ForgotPasswordPage() {
  return (
    <div className="animate-in fade-in duration-500">
      <AuthForm type="forgot-password" />
    </div>
  );
} 