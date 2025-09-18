'use client';

import { Download, Eye, MessageSquare, MoreHorizontal, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ModelAttributionBadge } from '@/components/library/ModelAttributionBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Doc } from '@/types/library';

export interface DocsGridProps {
  docs: Doc[];
  onDownload: (doc: Doc) => void;
  onDelete: (doc: Doc) => void;
  onPreview?: (doc: Doc) => void;
  formatFileSize: (bytes: number) => string;
  getMimeTypeIcon: (mimeType: string) => string;
}

export function DocsGrid({ 
  docs, 
  onDownload, 
  onDelete, 
  onPreview,
  formatFileSize, 
  getMimeTypeIcon 
}: DocsGridProps) {
  const { t } = useTranslation('library');
  if (docs.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">{t('grid.noDocuments')}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {docs.map((doc) => (
        <Card
          key={doc.uuid}
          className="hover:shadow-lg transition-shadow h-full flex flex-col justify-between bg-card border-border cursor-pointer"
          onClick={() => onPreview?.(doc)}
        >
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-2xl flex-shrink-0">{getMimeTypeIcon(doc.mime_type)}</span>
                <div className="min-w-0 flex-1">
                  <CardTitle
                    className="text-base font-semibold truncate"
                    title={doc.name}
                  >
                    {doc.name}
                  </CardTitle>
                  {doc.source === 'ai_generated' && doc.ai_metadata?.model && (
                    <div className="flex items-center gap-2 mt-1">
                      <ModelAttributionBadge
                        modelName={doc.ai_metadata.model.name}
                        modelProvider={doc.ai_metadata.model.provider}
                        modelVersion={doc.ai_metadata.model.version}
                        timestamp={doc.ai_metadata.timestamp}
                      />
                      {doc.ai_metadata.prompt && (
                        <div className="flex items-center gap-1" title={`Prompt: ${doc.ai_metadata.prompt.substring(0, 100)}...`}>
                          <MessageSquare className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Prompted</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 w-6 p-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">{t('grid.openMenu')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent 
                  align="end" 
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {onPreview && (
                    <DropdownMenuItem 
                      onClick={(e) => {
                        e.stopPropagation();
                        onPreview(doc);
                      }}
                      className="cursor-pointer"
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      {t('grid.preview')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownload(doc);
                    }}
                    className="cursor-pointer"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {t('grid.download')}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(doc);
                    }}
                    className="cursor-pointer text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('grid.delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col justify-between">
            <div className="space-y-2">
              {doc.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {doc.description}
                </p>
              )}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{formatFileSize(doc.file_size)}</span>
                <span className="mx-1">•</span>
                <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                {doc.source === 'ai_generated' && doc.version > 1 && (
                  <>
                    <span className="mx-1">•</span>
                    <Badge variant="outline" className="text-xs px-1 py-0">
                      v{doc.version}
                    </Badge>
                  </>
                )}
              </div>
              {doc.tags && doc.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {doc.tags.slice(0, 2).map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                  {doc.tags.length > 2 && (
                    <Badge variant="outline" className="text-xs">
                      +{doc.tags.length - 2}
                    </Badge>
                  )}
                </div>
              )}
              {doc.source === 'ai_generated' && doc.ai_metadata && (
                <div className="flex gap-2 mt-2">
                  {doc.ai_metadata.sourceDocuments && doc.ai_metadata.sourceDocuments.length > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {doc.ai_metadata.sourceDocuments.length} source{doc.ai_metadata.sourceDocuments.length > 1 ? 's' : ''}
                    </Badge>
                  )}
                  {doc.ai_metadata.conversationContext && doc.ai_metadata.conversationContext.length > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {doc.ai_metadata.conversationContext.length} context msg{doc.ai_metadata.conversationContext.length > 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
} 