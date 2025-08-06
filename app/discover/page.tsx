'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { MessageSquare, User2, ArrowRight } from 'lucide-react';

import { LandingNavbar } from '@/components/landing-navbar';
import { DiscoverAssistants } from '@/components/discover/discover-assistants';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';

export default function PublicDiscoverPage() {
  const router = useRouter();
  const { session } = useAuth();
  const { t } = useTranslation(['discover', 'common']);
  const [activeTab, setActiveTab] = useState('assistants');

  return (
    <>
      <LandingNavbar />
      <div className="container py-8 max-w-screen-2xl mx-auto px-4 md:px-8">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            {t('discover:title', 'Discover AI Assistants')}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t('discover:subtitle', 'Explore and connect with specialized AI assistants created by experts worldwide')}
          </p>
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2">
            <TabsTrigger value="assistants" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              {t('discover:tabs.chats', 'AI Assistants')}
            </TabsTrigger>
            <TabsTrigger value="experts" className="gap-2">
              <User2 className="h-4 w-4" />
              {t('discover:tabs.experts', 'Experts')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="assistants" className="space-y-6">
            <DiscoverAssistants />
          </TabsContent>

          <TabsContent value="experts" className="space-y-6">
            <Card>
              <CardContent className="py-12 text-center">
                <User2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  {t('discover:experts.title', 'Browse Expert Profiles')}
                </h3>
                <p className="text-muted-foreground mb-6">
                  {t('discover:experts.description', 'Discover AI assistant creators and their specialized bots')}
                </p>
                <Button 
                  variant="outline" 
                  onClick={() => router.push('/to')}
                  className="gap-2"
                >
                  {t('discover:experts.browseButton', 'Browse All Experts')}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* CTA Section for unauthenticated users */}
        {!session?.user && (
          <Card className="mt-12 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 border-purple-200 dark:border-purple-800">
            <CardContent className="py-8 text-center">
              <h3 className="text-2xl font-bold mb-3">
                {t('discover:cta.title', 'Join Our Community')}
              </h3>
              <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
                {t('discover:cta.description', 'Create your own AI assistants, share them with the world, and connect with other creators')}
              </p>
              <div className="flex gap-4 justify-center">
                <Button 
                  size="lg"
                  onClick={() => router.push('/register')}
                >
                  {t('discover:cta.signUp', 'Sign Up Free')}
                </Button>
                <Button 
                  size="lg"
                  variant="outline"
                  onClick={() => router.push('/login')}
                >
                  {t('discover:cta.logIn', 'Log In')}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}