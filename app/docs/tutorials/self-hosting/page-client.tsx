'use client';

import { CheckCircle, Database, Server, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function SelfHostingPageClient() {
  const { t } = useTranslation('tutorial-self-hosting');

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">{t('title')}</h1>
        <p className="text-xl text-muted-foreground">{t('description')}</p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            {t('overview.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>{t('overview.introduction')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-2">
              <Shield className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-semibold">{t('overview.features.control.title')}</h4>
                <p className="text-sm text-muted-foreground">{t('overview.features.control.description')}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Database className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-semibold">{t('overview.features.data.title')}</h4>
                <p className="text-sm text-muted-foreground">{t('overview.features.data.description')}</p>
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
              {t('prerequisites.server')}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              {t('prerequisites.docker')}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              {t('prerequisites.postgresql')}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              {t('prerequisites.domain')}
            </li>
          </ul>
        </CardContent>
      </Card>

      <div className="space-y-8 mb-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('steps.prepare.title')}</CardTitle>
              <Badge>{t('steps.prepare.badge')}</Badge>
            </div>
            <CardDescription>{t('steps.prepare.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t('steps.prepare.clone.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.prepare.clone.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{`git clone https://github.com/pluggedin-ai/pluggedin-app.git
git clone https://github.com/pluggedin-ai/pluggedin-mcp.git`}</code>
              </pre>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.prepare.requirements.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.prepare.requirements.description')}</p>
              <ul className="text-sm text-muted-foreground ml-4 mt-2 space-y-1">
                <li>• {t('steps.prepare.requirements.cpu')}</li>
                <li>• {t('steps.prepare.requirements.ram')}</li>
                <li>• {t('steps.prepare.requirements.storage')}</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('steps.database.title')}</CardTitle>
              <Badge variant="secondary">{t('steps.database.badge')}</Badge>
            </div>
            <CardDescription>{t('steps.database.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t('steps.database.setup.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.database.setup.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{`# PostgreSQL 15+
docker run -d \\
  --name pluggedin-postgres \\
  -e POSTGRES_PASSWORD=secure_password \\
  -e POSTGRES_DB=pluggedin \\
  -p 5432:5432 \\
  -v postgres_data:/var/lib/postgresql/data \\
  postgres:15`}</code>
              </pre>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.database.migrations.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.database.migrations.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{`cd pluggedin-app
pnpm db:migrate
pnpm db:migrate:auth`}</code>
              </pre>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('steps.configure.title')}</CardTitle>
              <Badge variant="outline">{t('steps.configure.badge')}</Badge>
            </div>
            <CardDescription>{t('steps.configure.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t('steps.configure.env.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.configure.env.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{`# .env.production
DATABASE_URL=postgresql://user:password@localhost:5432/pluggedin
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=generated-secret-key
PLUGGEDIN_API_KEY=your-api-key

# Optional features
ENABLE_RAG=true
ENABLE_NOTIFICATIONS=true
EMAIL_SERVER_HOST=smtp.example.com
EMAIL_SERVER_PORT=587`}</code>
              </pre>
            </div>
            <Alert>
              <AlertDescription>{t('steps.configure.tip')}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('steps.deploy.title')}</CardTitle>
              <Badge variant="secondary">{t('steps.deploy.badge')}</Badge>
            </div>
            <CardDescription>{t('steps.deploy.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t('steps.deploy.docker.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.deploy.docker.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{`# docker-compose.yml
version: '3.8'
services:
  app:
    build: ./pluggedin-app
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    depends_on:
      - postgres
      
  mcp:
    build: ./pluggedin-mcp
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production`}</code>
              </pre>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.deploy.nginx.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.deploy.nginx.description')}</p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.deploy.ssl.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.deploy.ssl.description')}</p>
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
            <li>• {t('nextSteps.monitoring')}</li>
            <li>• {t('nextSteps.backup')}</li>
            <li>• {t('nextSteps.security')}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}