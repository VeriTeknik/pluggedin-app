'use client';

import { ArrowRight, FlaskConical, LogIn, Unplug, Wrench } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { Footer } from '@/components/footer';
import { LandingHero } from '@/components/landing-hero';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LanguageSwitcher } from '@/components/ui/language-switcher';

export default function Home() {
  const { t } = useTranslation();
  
  return (
    <div className="min-h-screen flex flex-col">
      <div className="container mx-auto py-8 space-y-12 flex-grow">
        {/* Navigation */}
        <div className="flex justify-end gap-4 items-center">
          <LanguageSwitcher />
          <Button asChild variant="outline">
            <Link href="/mcp-servers" className="flex items-center">
              <LogIn className="mr-2 h-4 w-4" />
              {t('landing.navigation.enterApp')}
            </Link>
          </Button>
        </div>
        
        {/* Hero Section */}
        <LandingHero />

        {/* Feature Cards */}
        <section className="grid md:grid-cols-3 gap-6">
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <Unplug className="h-10 w-10 text-primary mb-4" />
              <CardTitle>{t('landing.features.pluginManagement.title')}</CardTitle>
              <CardDescription>
                {t('landing.features.pluginManagement.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                {t('landing.features.pluginManagement.content')}
              </p>
              <Button variant="outline" asChild className="w-full">
                <Link href="/mcp-servers">
                  {t('landing.features.pluginManagement.action')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <FlaskConical className="h-10 w-10 text-primary mb-4" />
              <CardTitle>{t('landing.features.aiPlayground.title')}</CardTitle>
              <CardDescription>
                {t('landing.features.aiPlayground.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                {t('landing.features.aiPlayground.content')}
              </p>
              <Button variant="outline" asChild className="w-full">
                <Link href="/mcp-playground">
                  {t('landing.features.aiPlayground.action')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <Wrench className="h-10 w-10 text-primary mb-4" />
              <CardTitle>{t('landing.features.customDevelopment.title')}</CardTitle>
              <CardDescription>
                {t('landing.features.customDevelopment.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                {t('landing.features.customDevelopment.content')}
              </p>
              <Button variant="outline" asChild className="w-full">
                <Link href="/custom-mcp-servers">
                  {t('landing.features.customDevelopment.action')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>

        {/* Getting Started */}
        <section className="border rounded-lg p-8 bg-muted/10">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-semibold mb-4">{t('landing.gettingStarted.title')}</h2>
            <p className="text-muted-foreground mb-6">
              {t('landing.gettingStarted.description')}
            </p>
            <Button asChild>
              <Link href="/setup-guide">
                {t('landing.gettingStarted.action')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </div>
      
      <Footer />
    </div>
  );
}
