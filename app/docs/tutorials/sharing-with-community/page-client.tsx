'use client';

import { BookOpen, CheckCircle,Globe, Lock, Share2, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function SharingWithCommunityPageClient() {
  const { t } = useTranslation('tutorial-sharing-with-community');

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">{t('title')}</h1>
        <p className="text-xl text-muted-foreground">{t('description')}</p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {t('overview.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>{t('overview.introduction')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-2">
              <Share2 className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-semibold">{t('overview.features.servers.title')}</h4>
                <p className="text-sm text-muted-foreground">{t('overview.features.servers.description')}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Users className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-semibold">{t('overview.features.collections.title')}</h4>
                <p className="text-sm text-muted-foreground">{t('overview.features.collections.description')}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>{t('prerequisites.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              {t('prerequisites.account')}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              {t('prerequisites.servers')}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              {t('prerequisites.profile')}
            </li>
          </ul>
        </CardContent>
      </Card>

      <div className="space-y-8 mb-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('steps.shareServer.title')}</CardTitle>
              <Badge>{t('steps.shareServer.badge')}</Badge>
            </div>
            <CardDescription>{t('steps.shareServer.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t('steps.shareServer.navigate.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.shareServer.navigate.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{t('steps.shareServer.navigate.code')}</code>
              </pre>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.shareServer.visibility.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.shareServer.visibility.description')}</p>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  <span className="text-sm">{t('steps.shareServer.visibility.public')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  <span className="text-sm">{t('steps.shareServer.visibility.private')}</span>
                </div>
              </div>
            </div>
            <Alert>
              <AlertDescription>{t('steps.shareServer.tip')}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('steps.createCollection.title')}</CardTitle>
              <Badge variant="secondary">{t('steps.createCollection.badge')}</Badge>
            </div>
            <CardDescription>{t('steps.createCollection.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t('steps.createCollection.create.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.createCollection.create.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{t('steps.createCollection.create.code')}</code>
              </pre>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.createCollection.organize.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.createCollection.organize.description')}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('steps.manageSharing.title')}</CardTitle>
              <Badge variant="outline">{t('steps.manageSharing.badge')}</Badge>
            </div>
            <CardDescription>{t('steps.manageSharing.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t('steps.manageSharing.profile.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.manageSharing.profile.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{t('steps.manageSharing.profile.code')}</code>
              </pre>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.manageSharing.stats.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.manageSharing.stats.description')}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('steps.discoverContent.title')}</CardTitle>
              <Badge variant="secondary">{t('steps.discoverContent.badge')}</Badge>
            </div>
            <CardDescription>{t('steps.discoverContent.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t('steps.discoverContent.browse.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.discoverContent.browse.description')}</p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.discoverContent.follow.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.discoverContent.follow.description')}</p>
            </div>
            <Alert>
              <AlertDescription>{t('steps.discoverContent.tip')}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('nextSteps.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            <li>• {t('nextSteps.team')}</li>
            <li>• {t('nextSteps.api')}</li>
            <li>• {t('nextSteps.custom')}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}