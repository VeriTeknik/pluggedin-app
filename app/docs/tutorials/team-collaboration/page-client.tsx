'use client';

import { CheckCircle,FolderOpen, Shield, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function TeamCollaborationPageClient() {
  const { t } = useTranslation('tutorial-team-collaboration');

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">{t('title')}</h1>
        <p className="text-xl text-muted-foreground">{t('description')}</p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('overview.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>{t('overview.introduction')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-2">
              <FolderOpen className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-semibold">{t('overview.features.workspaces.title')}</h4>
                <p className="text-sm text-muted-foreground">{t('overview.features.workspaces.description')}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Shield className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-semibold">{t('overview.features.permissions.title')}</h4>
                <p className="text-sm text-muted-foreground">{t('overview.features.permissions.description')}</p>
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
              {t('prerequisites.project')}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              {t('prerequisites.team')}
            </li>
          </ul>
        </CardContent>
      </Card>

      <div className="space-y-8 mb-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('steps.createWorkspace.title')}</CardTitle>
              <Badge>{t('steps.createWorkspace.badge')}</Badge>
            </div>
            <CardDescription>{t('steps.createWorkspace.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t('steps.createWorkspace.profiles.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.createWorkspace.profiles.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{t('steps.createWorkspace.profiles.code')}</code>
              </pre>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.createWorkspace.organize.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.createWorkspace.organize.description')}</p>
              <ul className="text-sm text-muted-foreground ml-4 mt-2 space-y-1">
                <li>• {t('steps.createWorkspace.organize.development')}</li>
                <li>• {t('steps.createWorkspace.organize.staging')}</li>
                <li>• {t('steps.createWorkspace.organize.production')}</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('steps.inviteMembers.title')}</CardTitle>
              <Badge variant="secondary">{t('steps.inviteMembers.badge')}</Badge>
            </div>
            <CardDescription>{t('steps.inviteMembers.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t('steps.inviteMembers.share.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.inviteMembers.share.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{t('steps.inviteMembers.share.code')}</code>
              </pre>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.inviteMembers.collections.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.inviteMembers.collections.description')}</p>
            </div>
            <Alert>
              <AlertDescription>{t('steps.inviteMembers.tip')}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('steps.manageAccess.title')}</CardTitle>
              <Badge variant="outline">{t('steps.manageAccess.badge')}</Badge>
            </div>
            <CardDescription>{t('steps.manageAccess.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t('steps.manageAccess.visibility.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.manageAccess.visibility.description')}</p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.manageAccess.apikeys.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.manageAccess.apikeys.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{t('steps.manageAccess.apikeys.code')}</code>
              </pre>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('steps.bestPractices.title')}</CardTitle>
              <Badge variant="secondary">{t('steps.bestPractices.badge')}</Badge>
            </div>
            <CardDescription>{t('steps.bestPractices.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t('steps.bestPractices.naming.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.bestPractices.naming.description')}</p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.bestPractices.documentation.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.bestPractices.documentation.description')}</p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.bestPractices.versioning.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.bestPractices.versioning.description')}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('nextSteps.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            <li>• {t('nextSteps.security')}</li>
            <li>• {t('nextSteps.api')}</li>
            <li>• {t('nextSteps.selfhost')}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}