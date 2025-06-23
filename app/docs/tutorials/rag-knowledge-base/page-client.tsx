'use client';

import { Brain, CheckCircle, FileText, Search, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function RagKnowledgeBasePageClient() {
  const { t } = useTranslation('tutorial-rag-knowledge-base');

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">{t('title')}</h1>
        <p className="text-xl text-muted-foreground">{t('description')}</p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            {t('overview.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>{t('overview.introduction')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-2">
              <FileText className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-semibold">{t('overview.features.documents.title')}</h4>
                <p className="text-sm text-muted-foreground">{t('overview.features.documents.description')}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Search className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-semibold">{t('overview.features.search.title')}</h4>
                <p className="text-sm text-muted-foreground">{t('overview.features.search.description')}</p>
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
              {t('prerequisites.documents')}
            </li>
          </ul>
        </CardContent>
      </Card>

      <div className="space-y-8 mb-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('steps.setupLibrary.title')}</CardTitle>
              <Badge>{t('steps.setupLibrary.badge')}</Badge>
            </div>
            <CardDescription>{t('steps.setupLibrary.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t('steps.setupLibrary.navigate.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.setupLibrary.navigate.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{t('steps.setupLibrary.navigate.code')}</code>
              </pre>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.setupLibrary.formats.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.setupLibrary.formats.description')}</p>
              <ul className="text-sm text-muted-foreground ml-4 mt-2 space-y-1">
                <li>• PDF</li>
                <li>• TXT</li>
                <li>• MD (Markdown)</li>
                <li>• DOCX</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('steps.uploadDocuments.title')}</CardTitle>
              <Badge variant="secondary">{t('steps.uploadDocuments.badge')}</Badge>
            </div>
            <CardDescription>{t('steps.uploadDocuments.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t('steps.uploadDocuments.upload.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.uploadDocuments.upload.description')}</p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Upload className="h-4 w-4" />
                <span>{t('steps.uploadDocuments.upload.action')}</span>
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.uploadDocuments.organize.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.uploadDocuments.organize.description')}</p>
            </div>
            <Alert>
              <AlertDescription>{t('steps.uploadDocuments.tip')}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('steps.queryKnowledge.title')}</CardTitle>
              <Badge variant="outline">{t('steps.queryKnowledge.badge')}</Badge>
            </div>
            <CardDescription>{t('steps.queryKnowledge.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t('steps.queryKnowledge.mcp.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.queryKnowledge.mcp.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{t('steps.queryKnowledge.mcp.code')}</code>
              </pre>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.queryKnowledge.api.title')}</h4>
              <p className="text-sm text-muted-foreground mb-2">{t('steps.queryKnowledge.api.description')}</p>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                <code>{`curl -X POST https://pluggedin.ai/api/rag/query \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "Your question here"}'`}</code>
              </pre>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('steps.advanced.title')}</CardTitle>
              <Badge variant="secondary">{t('steps.advanced.badge')}</Badge>
            </div>
            <CardDescription>{t('steps.advanced.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t('steps.advanced.chunking.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.advanced.chunking.description')}</p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.advanced.metadata.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.advanced.metadata.description')}</p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('steps.advanced.isolation.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('steps.advanced.isolation.description')}</p>
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
            <li>• {t('nextSteps.api')}</li>
            <li>• {t('nextSteps.team')}</li>
            <li>• {t('nextSteps.security')}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}