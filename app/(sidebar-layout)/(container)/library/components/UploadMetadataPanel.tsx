'use client';

import { Calendar, FileText, Link2, NotebookPen, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { sanitizeToPlainText } from '@/lib/sanitization';
import type { Doc } from '@/types/library';

interface UploadMetadataPanelProps {
  doc: Doc;
}

export function UploadMetadataPanel({ doc }: UploadMetadataPanelProps) {
  const { t } = useTranslation('library');

  // Only render if there's upload metadata
  if (doc.source !== 'upload' || !doc.upload_metadata) {
    return null;
  }

  const metadata = doc.upload_metadata;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Upload className="h-5 w-5" />
          {t('uploadMetadata.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload Method */}
        {metadata.uploadMethod && (
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">
              {t('uploadMetadata.uploadMethod')}
            </p>
            <Badge variant="secondary">
              {metadata.uploadMethod === 'drag-drop' && t('uploadMetadata.dragDrop')}
              {metadata.uploadMethod === 'file-picker' && t('uploadMetadata.filePicker')}
              {metadata.uploadMethod === 'api' && t('uploadMetadata.api')}
              {metadata.uploadMethod === 'paste' && t('uploadMetadata.paste')}
            </Badge>
          </div>
        )}

        {/* Purpose */}
        {metadata.purpose && (
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <FileText className="h-4 w-4" />
              {t('uploadMetadata.purpose')}
            </p>
            <p className="text-sm">{sanitizeToPlainText(metadata.purpose)}</p>
          </div>
        )}

        {/* Related To */}
        {metadata.relatedTo && (
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Link2 className="h-4 w-4" />
              {t('uploadMetadata.relatedTo')}
            </p>
            <p className="text-sm">{sanitizeToPlainText(metadata.relatedTo)}</p>
          </div>
        )}

        {/* Notes */}
        {metadata.notes && (
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <NotebookPen className="h-4 w-4" />
              {t('uploadMetadata.notes')}
            </p>
            <p className="text-sm whitespace-pre-wrap">{sanitizeToPlainText(metadata.notes)}</p>
          </div>
        )}

        {(metadata.uploadedAt || metadata.originalFileName || metadata.fileLastModified) && (
          <>
            <Separator />
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">
                {t('uploadMetadata.fileInfo')}
              </p>

              {/* Upload Time */}
              {metadata.uploadedAt && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{t('uploadMetadata.uploadedAt')}:</span>
                  <span>{new Date(metadata.uploadedAt).toLocaleString()}</span>
                </div>
              )}

              {/* Original File Name */}
              {metadata.originalFileName && (
                <div className="flex items-start gap-2 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <span className="text-muted-foreground">{t('uploadMetadata.originalFileName')}:</span>
                    <p className="font-mono text-xs mt-1">{metadata.originalFileName}</p>
                  </div>
                </div>
              )}

              {/* File Last Modified */}
              {metadata.fileLastModified && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{t('uploadMetadata.fileLastModified')}:</span>
                  <span>{new Date(metadata.fileLastModified).toLocaleString()}</span>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}