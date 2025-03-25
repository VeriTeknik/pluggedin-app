'use client';

import Link from 'next/link';

import { AuthForm } from '@/components/auth/auth-form';

export default function RegisterPage() {
  return (
    <div className="space-y-6">
      <AuthForm type="register" />
      
      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link
            href="/login"
            className="underline underline-offset-4 hover:text-primary"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
} 