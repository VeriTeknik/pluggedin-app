'use client';

import { CheckCircle, Circle, FileText, Loader2, X, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useUploadProgress } from '@/contexts/UploadProgressContext';
import type { UploadProgressState } from '@/types/docs';

const STEP_NAMES = {
  text_extraction: 'textExtraction',
  chunking: 'chunking',
  id_generation: 'idGeneration',
  embeddings: 'embeddings',
  database_insertion: 'databaseInsertion',
} as const;

const STEP_DESCRIPTIONS = {
  text_extraction: 'textExtraction',
  chunking: 'chunking',
  id_generation: 'idGeneration',
  embeddings: 'embeddings',
  database_insertion: 'databaseInsertion',
} as const;

interface UploadProgressProps {
  className?: string;
}

function UploadProgressItem({ upload }: { upload: UploadProgressState }) {
  const { t } = useTranslation('docs');
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  useEffect(() => {
    if (upload.progress.step_progress?.estimated_remaining_time) {
      setTimeRemaining(upload.progress.step_progress.estimated_remaining_time);
    }
  }, [upload.progress.step_progress?.estimated_remaining_time]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getOverallProgress = () => {
    // If completed, always show 100%
    if (upload.status === 'completed') {
      return 100;
    }
    
    const stepProgress = (upload.progress.current - 1) / upload.progress.total * 100;
    const currentStepProgress = (upload.progress.step_progress?.percentage || 0) / upload.progress.total;
    return Math.min(100, stepProgress + currentStepProgress);
  };

  const getStepIcon = (stepName: keyof typeof STEP_NAMES, stepIndex: number) => {
    const currentStepIndex = upload.progress.current;
    
    if (stepIndex < currentStepIndex) {
      return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    } else if (stepIndex === currentStepIndex && upload.status === 'processing') {
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    } else if (stepIndex === currentStepIndex && upload.status === 'failed') {
      return <XCircle className="h-4 w-4 text-red-500" />;
    } else {
      return <Circle className="h-4 w-4 text-muted-foreground/40" />;
    }
  };

  const getStatusColor = () => {
    switch (upload.status) {
      case 'processing':
        return 'border-blue-200/50 bg-blue-50/30 dark:border-blue-800/50 dark:bg-blue-950/30';
      case 'completed':
        return 'border-emerald-200/50 bg-emerald-50/30 dark:border-emerald-800/50 dark:bg-emerald-950/30';
      case 'failed':
        return 'border-red-200/50 bg-red-50/30 dark:border-red-800/50 dark:bg-red-950/30';
      default:
        return 'border-border bg-card';
    }
  };

  return (
    <Card className={`${getStatusColor()} transition-all duration-200 shadow-sm hover:shadow-md`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="truncate">{upload.file_name}</span>
          </CardTitle>
          <div className="text-xs text-muted-foreground font-mono">
            {formatFileSize(upload.file_size)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">
              {upload.status === 'completed' ? t('uploadProgress.processingComplete') : 
               upload.status === 'failed' ? t('uploadProgress.processingFailed') :
               `${t('uploadProgress.step')} ${upload.progress.current} ${t('uploadProgress.of')} ${upload.progress.total}`}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              {(upload.status === 'processing' || upload.status === 'completed') && `${getOverallProgress().toFixed(1)}%`}
            </span>
          </div>
          <Progress 
            value={getOverallProgress()} 
            className="h-2 bg-muted/50" 
          />
        </div>

        {/* Current Step Details */}
        {upload.status === 'processing' && (
          <div className="bg-card/50 border border-border/50 rounded-lg p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              <span className="text-sm font-medium">
                {t(`uploadProgress.steps.${STEP_NAMES[upload.progress.step]}`)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {upload.message}
            </p>
            {(upload.progress.step_progress?.percentage || 0) > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{t('uploadProgress.currentStepProgress')}</span>
                  <span className="font-mono">{(upload.progress.step_progress?.percentage || 0).toFixed(1)}%</span>
                </div>
                <Progress 
                  value={upload.progress.step_progress?.percentage || 0} 
                  className="h-1.5 bg-muted/30" 
                />
                {upload.progress.step_progress?.chunks_processed && (
                  <div className="text-xs text-muted-foreground font-mono">
                    {upload.progress.step_progress.chunks_processed.toLocaleString()} / {upload.progress.step_progress.total_chunks?.toLocaleString()} {t('uploadProgress.chunksProcessed')}
                  </div>
                )}
              </div>
            )}
            {timeRemaining && (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <span>⏱️</span>
                <span>{timeRemaining} {t('uploadProgress.remaining')}</span>
              </div>
            )}
          </div>
        )}

        {/* Step List */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground mb-2">{t('uploadProgress.processingSteps')}</div>
          {Object.entries(STEP_NAMES).map(([key, translationKey], index) => {
            const stepIndex = index + 1;
            const isActive = stepIndex === upload.progress.current && upload.status === 'processing';
            const isCompleted = stepIndex < upload.progress.current || upload.status === 'completed';
            
            return (
              <div key={key} className={`flex items-center gap-3 text-sm p-2 rounded-md transition-colors ${
                isActive ? 'bg-blue-50/50 dark:bg-blue-950/30' : 
                isCompleted ? 'bg-emerald-50/30 dark:bg-emerald-950/20' : ''
              }`}>
                {getStepIcon(key as keyof typeof STEP_NAMES, stepIndex)}
                <div className="flex-1 min-w-0">
                  <div className={`${
                    isCompleted || isActive ? 'text-foreground' : 'text-muted-foreground'
                  } font-medium`}>
                    {t(`uploadProgress.steps.${translationKey}`)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t(`uploadProgress.stepDescriptions.${STEP_DESCRIPTIONS[key as keyof typeof STEP_DESCRIPTIONS]}`)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Status Messages */}
        {upload.status === 'completed' && (
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm font-medium">{t('uploadProgress.processingComplete')}</span>
            </div>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
              {t('uploadProgress.completedMessage')}
            </p>
          </div>
        )}

        {upload.status === 'failed' && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
              <XCircle className="h-4 w-4" />
              <span className="text-sm font-medium">{t('uploadProgress.processingFailed')}</span>
            </div>
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              {upload.message || t('uploadProgress.failedMessage')}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function UploadProgress({ className }: UploadProgressProps) {
  const { t } = useTranslation('docs');
  const { uploads, clearCompleted, removeUpload } = useUploadProgress();

  if (uploads.length === 0) {
    return null;
  }

  const completedUploads = uploads.filter(upload => upload.status !== 'processing');

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5 text-muted-foreground" />
          {t('uploadProgress.title')} ({uploads.length})
        </h3>
        {completedUploads.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={clearCompleted}
            className="text-xs"
          >
            {t('uploadProgress.clearCompleted')}
          </Button>
        )}
      </div>

      {/* Progress Items */}
      <div className="space-y-3">
        {uploads.map((upload) => (
          <div key={upload.upload_id} className="relative group">
            <UploadProgressItem upload={upload} />
            {upload.status !== 'processing' && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-2 right-2 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => removeUpload(upload.upload_id)}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
} 