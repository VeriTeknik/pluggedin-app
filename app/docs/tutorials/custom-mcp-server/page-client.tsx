'use client';

import { CheckCircle,Code, Package, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function CustomMcpServerPageClient() {
  const { t } = useTranslation('tutorial-custom-mcp-server');

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">{t('title')}</h1>
        <p className="text-xl text-muted-foreground">{t('description')}</p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            {t('overview.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>{t('overview.introduction')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-2">
              <Wrench className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-semibold">{t('overview.features.tools.title')}</h4>
                <p className="text-sm text-muted-foreground">{t('overview.features.tools.description')}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Package className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-semibold">{t('overview.features.resources.title')}</h4>
                <p className="text-sm text-muted-foreground">{t('overview.features.resources.description')}</p>
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
              {t('prerequisites.programming')}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              {t('prerequisites.nodejs')}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              {t('prerequisites.mcp')}
            </li>
          </ul>
        </CardContent>
      </Card>

      <div className="space-y-8 mb-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('steps.setup.title')}</CardTitle>
              <Badge>{t('steps.setup.badge')}</Badge>
            </div>
            <CardDescription>{t('steps.setup.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t('steps.setup.sdk.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.setup.sdk.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{`# TypeScript/JavaScript
npm install @modelcontextprotocol/sdk

# Python
pip install mcp`}</code>
              </pre>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.setup.structure.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.setup.structure.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{`my-mcp-server/
├── src/
│   ├── index.ts
│   └── tools.ts
├── package.json
└── tsconfig.json`}</code>
              </pre>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('steps.implement.title')}</CardTitle>
              <Badge variant="secondary">{t('steps.implement.badge')}</Badge>
            </div>
            <CardDescription>{t('steps.implement.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t('steps.implement.basic.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.implement.basic.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{`import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({
  name: 'my-custom-server',
  version: '1.0.0',
});

// Define tools
server.setRequestHandler('tool/list', async () => ({
  tools: [{
    name: 'my_tool',
    description: 'My custom tool',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string' }
      }
    }
  }]
}));

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);`}</code>
              </pre>
            </div>
            <Alert>
              <AlertDescription>{t('steps.implement.tip')}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('steps.test.title')}</CardTitle>
              <Badge variant="outline">{t('steps.test.badge')}</Badge>
            </div>
            <CardDescription>{t('steps.test.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t('steps.test.inspector.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.test.inspector.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{`npx @modelcontextprotocol/inspector node ./dist/index.js`}</code>
              </pre>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.test.pluggedin.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.test.pluggedin.description')}</p>
            </div>
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
              <h4 className="font-semibold mb-2">{t('steps.deploy.package.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.deploy.package.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{`{
  "name": "my-mcp-server",
  "bin": {
    "my-mcp-server": "./dist/index.js"
  }
}`}</code>
              </pre>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.deploy.share.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.deploy.share.description')}</p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.deploy.registry.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.deploy.registry.description')}</p>
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
            <li>• {t('nextSteps.advanced')}</li>
            <li>• {t('nextSteps.share')}</li>
            <li>• {t('nextSteps.security')}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}