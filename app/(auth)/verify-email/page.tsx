'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback,useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { verifyEmail } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';

function VerifyEmailContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const token = searchParams.get('token');
  const [isVerifying, setIsVerifying] = useState(false);

  const handleVerify = useCallback(async () => {
    if (!token) {
      toast({
        title: t('auth.verifyEmail.error'),
        description: t('auth.verifyEmail.noToken'),
        variant: 'destructive',
      });
      return;
    }

    setIsVerifying(true);
    try {
      await verifyEmail(token);
      toast({
        title: t('auth.verifyEmail.success'),
        description: t('auth.verifyEmail.successDescription'),
      });
      router.push('/login');
    } catch (_error) {
      toast({
        title: t('auth.verifyEmail.error'),
        description: t('auth.verifyEmail.errorDescription'),
        variant: 'destructive',
      });
    } finally {
      setIsVerifying(false);
    }
  }, [token, t, toast, router]);

  useEffect(() => {
    if (token) {
      handleVerify();
    }
  }, [token, handleVerify]);

  return (
    <div className="container relative min-h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-1 lg:px-0">
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('auth.verifyEmail.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={handleVerify} 
            className="w-full"
            disabled={isVerifying}
          >
            {isVerifying ? t('common.verifying') : t('auth.verifyEmail.verify')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
} 