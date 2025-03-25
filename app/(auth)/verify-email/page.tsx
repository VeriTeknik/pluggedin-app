'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function verifyEmail() {
      try {
        if (!token) {
          setError('Missing verification token');
          setVerifying(false);
          return;
        }

        const response = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.message || 'Verification failed');
          setVerifying(false);
          return;
        }

        setVerified(true);
        setVerifying(false);
      } catch (err) {
        setError('An unexpected error occurred');
        setVerifying(false);
      }
    }

    verifyEmail();
  }, [token]);

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Email Verification</CardTitle>
        <CardDescription>
          {verifying
            ? 'Verifying your email...'
            : verified
            ? 'Your email has been verified!'
            : 'Email verification failed.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {verifying ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : verified ? (
          <p className="text-center text-green-600">
            Your email has been successfully verified. You can now sign in to your account.
          </p>
        ) : (
          <p className="text-center text-red-600">{error}</p>
        )}
      </CardContent>
      <CardFooter className="flex justify-center">
        {!verifying && (
          <Button asChild>
            <Link href="/login">Go to login</Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
} 