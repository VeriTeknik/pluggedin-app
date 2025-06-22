'use client';

import { CheckCircle, Globe, Shield, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function ApiIntegrationPageClient() {
  const { t } = useTranslation('tutorial-api-integration');

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">{t('title')}</h1>
        <p className="text-xl text-muted-foreground">{t('description')}</p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {t('overview.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>{t('overview.introduction')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-2">
              <Zap className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-semibold">{t('overview.features.automation.title')}</h4>
                <p className="text-sm text-muted-foreground">{t('overview.features.automation.description')}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Shield className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-semibold">{t('overview.features.security.title')}</h4>
                <p className="text-sm text-muted-foreground">{t('overview.features.security.description')}</p>
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
              {t('prerequisites.programming')}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              {t('prerequisites.http')}
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
              <h4 className="font-semibold mb-2">{t('steps.authentication.generate.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.authentication.generate.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{t('steps.authentication.generate.code')}</code>
              </pre>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.authentication.usage.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.authentication.usage.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{`Authorization: Bearer YOUR_API_KEY`}</code>
              </pre>
            </div>
            <Alert>
              <AlertDescription>{t('steps.authentication.tip')}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('steps.endpoints.title')}</CardTitle>
              <Badge variant="secondary">{t('steps.endpoints.badge')}</Badge>
            </div>
            <CardDescription>{t('steps.endpoints.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t('steps.endpoints.servers.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.endpoints.servers.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{`# List servers
GET /api/servers

# Get server details
GET /api/servers/:id

# Create server
POST /api/servers

# Update server
PUT /api/servers/:id`}</code>
              </pre>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.endpoints.rag.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.endpoints.rag.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{`POST /api/rag/query
{
  "query": "Your question here",
  "limit": 5
}`}</code>
              </pre>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('steps.examples.title')}</CardTitle>
              <Badge variant="outline">{t('steps.examples.badge')}</Badge>
            </div>
            <CardDescription>{t('steps.examples.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t('steps.examples.javascript.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.examples.javascript.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{`const response = await fetch('https://pluggedin.ai/api/servers', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  }
});

const servers = await response.json();`}</code>
              </pre>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.examples.python.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.examples.python.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{`import requests

headers = {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
}

response = requests.get('https://pluggedin.ai/api/servers', headers=headers)
servers = response.json()`}</code>
              </pre>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('steps.ratelimits.title')}</CardTitle>
              <Badge variant="secondary">{t('steps.ratelimits.badge')}</Badge>
            </div>
            <CardDescription>{t('steps.ratelimits.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t('steps.ratelimits.tiers.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.ratelimits.tiers.description')}</p>
              <ul className="text-sm text-muted-foreground ml-4 mt-2 space-y-1">
                <li>• {t('steps.ratelimits.tiers.standard')}</li>
                <li>• {t('steps.ratelimits.tiers.sensitive')}</li>
                <li>• {t('steps.ratelimits.tiers.public')}</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.ratelimits.headers.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.ratelimits.headers.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{`X-RateLimit-Limit: 60
X-RateLimit-Remaining: 59
X-RateLimit-Reset: 1640995200`}</code>
              </pre>
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
            <li>• {t('nextSteps.webhooks')}</li>
            <li>• {t('nextSteps.sdks')}</li>
            <li>• {t('nextSteps.security')}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}