'use client';

import Link from 'next/link';

import { AuthForm } from '@/components/auth/auth-form';

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <AuthForm type="forgot-password" />
      
      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          Remember your password?{' '}
          <Link
            href="/login"
            className="underline underline-offset-4 hover:text-primary"
          >
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
} 