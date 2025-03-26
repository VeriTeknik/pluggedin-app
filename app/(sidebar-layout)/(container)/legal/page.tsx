'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { FileText, Info, Mail, Shield } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

export default function LegalPage() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col space-y-6 p-6">
      <div className="flex flex-col space-y-2">
        <h1 className="text-3xl font-bold">{t('legal.title')}</h1>
        <p className="text-muted-foreground">{t('legal.description')}</p>
        <Separator className="my-4" />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Link href="/legal/privacy-policy" className="no-underline">
          <Card className="h-full transition-all hover:bg-muted/50">
            <CardHeader className="flex flex-row items-center gap-4">
              <Shield className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>{t('legal.pages.privacy.title')}</CardTitle>
                <CardDescription>{t('legal.pages.privacy.description')}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t('legal.pages.privacy.content.intro')}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/legal/terms-of-service" className="no-underline">
          <Card className="h-full transition-all hover:bg-muted/50">
            <CardHeader className="flex flex-row items-center gap-4">
              <FileText className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>{t('legal.pages.terms.title')}</CardTitle>
                <CardDescription>{t('legal.pages.terms.description')}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t('legal.pages.terms.content.intro')}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/legal/contact" className="no-underline">
          <Card className="h-full transition-all hover:bg-muted/50">
            <CardHeader className="flex flex-row items-center gap-4">
              <Mail className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>{t('legal.pages.contact.title')}</CardTitle>
                <CardDescription>{t('legal.pages.contact.description')}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t('legal.pages.contact.content.description')}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/legal/disclaimer" className="no-underline">
          <Card className="h-full transition-all hover:bg-muted/50">
            <CardHeader className="flex flex-row items-center gap-4">
              <Info className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>{t('legal.pages.disclaimer.title')}</CardTitle>
                <CardDescription>{t('legal.pages.disclaimer.description')}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t('legal.pages.disclaimer.content.thirdParty')}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
