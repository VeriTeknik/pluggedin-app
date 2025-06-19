'use client';

import { Download, MoreHorizontal, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  formatFileSize: (bytes: number) => string;
  getMimeTypeIcon: (mimeType: string) => string;
}

export function DocsGrid({ 
  docs, 
  onDownload, 
  onDelete, 
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
          className="hover:shadow-lg transition-shadow h-full flex flex-col justify-between bg-zinc-900/80 border-zinc-800"
        >
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-2xl">{getMimeTypeIcon(doc.mime_type)}</span>
                <CardTitle
                  className="text-base font-semibold truncate max-w-[160px] md:max-w-[180px] lg:max-w-[200px]"
                  title={doc.name}
                >
                  {doc.name}
                </CardTitle>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">{t('grid.openMenu')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem 
                    onClick={() => onDownload(doc)}
                    className="cursor-pointer"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {t('grid.download')}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => onDelete(doc)}
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
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
} 