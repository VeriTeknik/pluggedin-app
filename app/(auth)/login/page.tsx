'use client';

import Link from 'next/link';

import { AuthForm } from '@/components/auth/auth-form';

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <AuthForm type="login" />
      
      <div className="text-center space-y-2">
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link
            href="/register"
            className="underline underline-offset-4 hover:text-primary"
          >
            Sign up
          </Link>
        </p>
        <p className="text-sm text-muted-foreground">
          <Link
            href="/forgot-password"
            className="underline underline-offset-4 hover:text-primary"
          >
            Forgot your password?
          </Link>
        </p>
      </div>
    </div>
  );
} 