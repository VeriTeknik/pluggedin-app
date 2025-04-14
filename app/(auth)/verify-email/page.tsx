'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
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

  useEffect(() => {
    if (token) {
      handleVerify();
    }
  }, [token]);

  const handleVerify = async () => {
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
    } catch (error) {
      toast({
        title: t('auth.verifyEmail.error'),
        description: t('auth.verifyEmail.errorDescription'),
        variant: 'destructive',
      });
    } finally {
      setIsVerifying(false);
    }
  };

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