'use client';

import { formatDistanceToNow } from 'date-fns';
import DOMPurify from 'dompurify';
import { Bot, ChevronRight, FileText, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { RecentDocument } from '@/app/actions/analytics';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Constants
const DASHBOARD_DOCUMENTS_LIMIT = 10;

interface RecentDocumentsProps {
  documents: RecentDocument[] | undefined;
  isLoading: boolean;
  onDocumentClick?: (documentId: string) => void;
}

export const RecentDocuments = memo(function RecentDocuments({ documents, isLoading, onDocumentClick }: RecentDocumentsProps) {
  const { t } = useTranslation('analytics');
  const router = useRouter();

  const handleDocumentClick = (docId: string) => {
    if (onDocumentClick) {
      onDocumentClick(docId);
    } else {
      // Navigate to library with document selected
      router.push(`/library?doc=${docId}`);
    }
  };

  const getSourceBadge = useMemo(() => (source: string) => {
    switch (source) {
      case 'ai_generated':
        return (
          <Badge variant="secondary" className="text-xs">
            <Bot className="h-3 w-3 mr-1" />
            AI
          </Badge>
        );
      case 'api':
        return (
          <Badge variant="outline" className="text-xs">
            API
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-xs">
            <Upload className="h-3 w-3 mr-1" />
            Upload
          </Badge>
        );
    }
  }, []);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t('dashboard.recentDocuments')}
          </CardTitle>
          <CardDescription>{t('dashboard.recentDocumentsDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-14" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const hasDocuments = documents && documents.length > 0;

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t('dashboard.recentDocuments')}
            </CardTitle>
            <CardDescription>{t('dashboard.recentDocumentsDescription')}</CardDescription>
          </div>
          {hasDocuments && (
            <Link href="/library">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                {t('dashboard.viewAll')}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!hasDocuments ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">
              {t('dashboard.emptyDocs.title')}
            </h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              {t('dashboard.emptyDocs.description')}
            </p>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <Link href="/library">
                <Button className="w-full" size="sm">
                  <Upload className="h-4 w-4 mr-2" />
                  {t('dashboard.emptyDocs.uploadAction')}
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.slice(0, DASHBOARD_DOCUMENTS_LIMIT).map((doc) => (
              <div
                key={doc.uuid}
                role="listitem"
                tabIndex={0}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group focus:outline-none focus:ring-2 focus:ring-primary/50"
                onClick={() => handleDocumentClick(doc.uuid)}
                onKeyPress={(e) => e.key === 'Enter' && handleDocumentClick(doc.uuid)}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {DOMPurify.sanitize(doc.name, { ALLOWED_TAGS: [] })}
                      </p>
                      {doc.version > 1 && (
                        <Badge variant="secondary" className="text-xs">
                          v{doc.version}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {getSourceBadge(doc.source)}
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
                      </span>
                      {doc.ai_metadata?.model && (
                        <span className="text-xs text-muted-foreground">
                          • {doc.ai_metadata.model.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
});