'use client';

import { AlertTriangle, CheckCircle,Eye, Key, Lock, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function SecurityBestPracticesPageClient() {
  const { t } = useTranslation('tutorial-security-best-practices');

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">{t('title')}</h1>
        <p className="text-xl text-muted-foreground">{t('description')}</p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t('overview.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>{t('overview.introduction')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-2">
              <Lock className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-semibold">{t('overview.features.encryption.title')}</h4>
                <p className="text-sm text-muted-foreground">{t('overview.features.encryption.description')}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Key className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-semibold">{t('overview.features.access.title')}</h4>
                <p className="text-sm text-muted-foreground">{t('overview.features.access.description')}</p>
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
              {t('prerequisites.admin')}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              {t('prerequisites.understanding')}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              {t('prerequisites.access')}
            </li>
          </ul>
        </CardContent>
      </Card>

      <div className="space-y-8 mb-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('steps.authentication.title')}</CardTitle>
              <Badge>{t('steps.authentication.badge')}</Badge>
            </div>
            <CardDescription>{t('steps.authentication.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t('steps.authentication.mfa.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.authentication.mfa.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{t('steps.authentication.mfa.code')}</code>
              </pre>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.authentication.sessions.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.authentication.sessions.description')}</p>
            </div>
            <Alert className="border-yellow-500">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{t('steps.authentication.warning')}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('steps.apikeys.title')}</CardTitle>
              <Badge variant="secondary">{t('steps.apikeys.badge')}</Badge>
            </div>
            <CardDescription>{t('steps.apikeys.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t('steps.apikeys.rotation.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.apikeys.rotation.description')}</p>
              <ul className="text-sm text-muted-foreground ml-4 mt-2 space-y-1">
                <li>• {t('steps.apikeys.rotation.quarterly')}</li>
                <li>• {t('steps.apikeys.rotation.compromise')}</li>
                <li>• {t('steps.apikeys.rotation.employee')}</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.apikeys.storage.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.apikeys.storage.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{`# Use environment variables
export PLUGGEDIN_API_KEY="your-key-here"

# Never commit to git
echo "PLUGGEDIN_API_KEY" >> .gitignore`}</code>
              </pre>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('steps.encryption.title')}</CardTitle>
              <Badge variant="outline">{t('steps.encryption.badge')}</Badge>
            </div>
            <CardDescription>{t('steps.encryption.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t('steps.encryption.e2e.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.encryption.e2e.description')}</p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.encryption.transit.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.encryption.transit.description')}</p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.encryption.rest.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.encryption.rest.description')}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('steps.monitoring.title')}</CardTitle>
              <Badge variant="secondary">{t('steps.monitoring.badge')}</Badge>
            </div>
            <CardDescription>{t('steps.monitoring.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t('steps.monitoring.audit.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.monitoring.audit.description')}</p>
              <ul className="text-sm text-muted-foreground ml-4 mt-2 space-y-1">
                <li>• {t('steps.monitoring.audit.logins')}</li>
                <li>• {t('steps.monitoring.audit.apikey')}</li>
                <li>• {t('steps.monitoring.audit.server')}</li>
                <li>• {t('steps.monitoring.audit.permissions')}</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.monitoring.alerts.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.monitoring.alerts.description')}</p>
            </div>
            <Alert>
              <Eye className="h-4 w-4" />
              <AlertDescription>{t('steps.monitoring.tip')}</AlertDescription>
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
            <li>• {t('nextSteps.review')}</li>
            <li>• {t('nextSteps.training')}</li>
            <li>• {t('nextSteps.incident')}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}