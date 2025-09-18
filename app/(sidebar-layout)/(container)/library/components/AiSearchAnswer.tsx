'use client';

import { AlertCircle, ChevronDown, ChevronUp, FileText, Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export interface AiSearchAnswerProps {
  answer: string | null;
  sources?: string[];
  documentIds?: string[];
  documents?: Array<{ id: string; name: string }>;
  isLoading: boolean;
  error: string | null;
  query: string;
  onDocumentClick?: (documentId: string) => void;
}

export function AiSearchAnswer({ answer, sources = [], documentIds = [], documents = [], isLoading, error, query, onDocumentClick }: AiSearchAnswerProps) {
  const { t } = useTranslation('library');
  const [isExpanded, setIsExpanded] = useState(true);

  if (!query && !answer && !isLoading && !error) {
    return null;
  }

  if (isLoading) {
    return (
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <CardTitle className="text-base">
              {t('aiSearch.loading', 'Searching your documents...')}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t('aiSearch.loadingDescription', 'AI is analyzing your documents to find the best answer.')}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mb-6">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{t('aiSearch.errorTitle', 'Search Error')}</AlertTitle>
        <AlertDescription>
          {error}
        </AlertDescription>
      </Alert>
    );
  }

  if (!answer) {
    return null;
  }

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">
              {t('aiSearch.answerTitle', 'AI Answer')}
            </CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-label={isExpanded ? t('aiSearch.collapse', 'Collapse answer') : t('aiSearch.expand', 'Expand answer')}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
        {query && (
          <CardDescription className="mt-1">
            {t('aiSearch.questionPrefix', 'Question:')} {query}
          </CardDescription>
        )}
      </CardHeader>
      {isExpanded && (
        <CardContent>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <p className="text-sm whitespace-pre-wrap">{answer}</p>
          </div>
          {(sources.length > 0 || documents.length > 0) && (
            <>
              <Separator className="my-4" />
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">
                    {t('aiSearch.sources', 'Sources')} ({documents.length > 0 ? documents.length : sources.length})
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {documents.length > 0 ? (
                    // Display document names if available
                    documents.map((doc, index) => {
                      return onDocumentClick ? (
                        <Button
                          key={`${doc.id}-${index}`}
                          variant="secondary"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => onDocumentClick(doc.id)}
                          title={doc.name}
                        >
                          <FileText className="h-3 w-3 mr-1" />
                          {doc.name.length > 30 ? doc.name.substring(0, 30) + '...' : doc.name}
                        </Button>
                      ) : (
                        <Badge
                          key={`${doc.id}-${index}`}
                          variant="secondary"
                          className="text-xs cursor-default"
                          title={doc.name}
                        >
                          <FileText className="h-3 w-3 mr-1 inline" />
                          {doc.name.length > 30 ? doc.name.substring(0, 30) + '...' : doc.name}
                        </Badge>
                      );
                    })
                  ) : (
                    // Fallback to sources/documentIds if documents not available
                    sources.map((source, index) => {
                      const documentId = documentIds[index];
                      const displayName = source.startsWith('Document ') ?
                        source.replace('Document ', '').substring(0, 8) + '...' :
                        source;

                      return onDocumentClick && documentId ? (
                        <Button
                          key={`${source}-${index}`}
                          variant="secondary"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => onDocumentClick(documentId)}
                        >
                          <FileText className="h-3 w-3 mr-1" />
                          {displayName}
                        </Button>
                      ) : (
                        <Badge
                          key={`${source}-${index}`}
                          variant="secondary"
                          className="text-xs cursor-default"
                        >
                          <FileText className="h-3 w-3 mr-1 inline" />
                          {displayName}
                        </Badge>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}