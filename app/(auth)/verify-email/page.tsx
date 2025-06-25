'use client';

import { Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { verifyEmail } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
      setTimeout(() => {
        router.push('/login');
      }, 2000);
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
      <div className="lg:p-8">
        <Card className="mx-auto w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-semibold tracking-tight">
              {t('auth.verifyEmail.title')}
            </CardTitle>
            <CardDescription>
              {isVerifying 
                ? t('common.verifying') 
                : t('auth.verifyEmail.verify')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <Button 
                onClick={handleVerify} 
                className="w-full"
                disabled={isVerifying}
              >
                {isVerifying && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isVerifying ? t('common.verifying') : t('auth.verifyEmail.verify')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="animate-in fade-in duration-500">
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }>
        <VerifyEmailContent />
      </Suspense>
    </div>
  );
} 