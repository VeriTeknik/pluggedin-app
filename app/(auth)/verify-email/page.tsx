'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/ui/icons';

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  
  const [verificationState, setVerificationState] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setVerificationState('error');
      setErrorMessage('No verification token provided');
      return;
    }

    const verifyEmail = async () => {
      try {
        const response = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (response.ok) {
          setVerificationState('success');
        } else {
          setVerificationState('error');
          setErrorMessage(data.message || 'Failed to verify email');
        }
      } catch (error) {
        setVerificationState('error');
        setErrorMessage('An error occurred during verification');
        console.error('Verification error:', error);
      }
    };

    verifyEmail();
  }, [token]);

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl text-center">Email Verification</CardTitle>
        <CardDescription className="text-center">
          {verificationState === 'loading' && 'Verifying your email...'}
          {verificationState === 'success' && 'Your email has been verified!'}
          {verificationState === 'error' && 'Email verification failed'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center items-center py-6">
        {verificationState === 'loading' && (
          <Icons.spinner className="h-12 w-12 animate-spin" />
        )}
        {verificationState === 'success' && (
          <Icons.check className="h-12 w-12 text-green-500" />
        )}
        {verificationState === 'error' && (
          <>
            <Icons.close className="h-12 w-12 text-red-500" />
            <p className="text-red-500 mt-2">{errorMessage}</p>
          </>
        )}
      </CardContent>
      <CardFooter className="flex justify-center">
        {verificationState !== 'loading' && (
          <Button asChild>
            <Link href="/login">
              {verificationState === 'success' ? 'Sign in to your account' : 'Return to login'}
            </Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
} 