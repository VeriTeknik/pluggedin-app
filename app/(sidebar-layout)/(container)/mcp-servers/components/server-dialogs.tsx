'use client';

import { Copy, Download, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (json: string) => Promise<void>;
  isSubmitting: boolean;
}

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exportJson: string;
}

export function ImportDialog({ open, onOpenChange, onImport, isSubmitting }: ImportDialogProps) {
  const { t } = useTranslation();
  const [importJson, setImportJson] = useState('');
  const [importError, setImportError] = useState('');
  const { toast } = useToast();

  const handleClose = () => {
    onOpenChange(false);
    setImportJson('');
    setImportError('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{t('mcpServers.import.title')}</DialogTitle>
          <DialogDescription>
            {t('mcpServers.import.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* JSON Format Example - Left Side */}
            <div className="w-full lg:w-1/2">
              <h4 className="text-sm font-medium mb-2">{t('mcpServers.import.jsonFormat')}</h4>
              <ScrollArea className="h-[400px] border rounded-md">
                <pre className="p-3 bg-slate-900 text-slate-50 rounded-md text-xs">
                  {`{
  "mcpServers": {
    "CommandBasedServerName": {
      "command": "command",
      "args": ["arg1", "arg2"],
      "env": {
        "KEY": "value"
      },
      "description": "Optional description",
      "type": "stdio" // optional, defaults to "stdio"
    },
    "UrlBasedServerName": {
      "url": "https://example.com/sse",
      "description": "Optional description",
      "type": "sse" // optional, defaults to "stdio"
    },
    "StreamableHttpServerName": {
      "url": "https://server.smithery.ai/@owner/server/mcp?api_key=YOUR_KEY",
      "description": "Streamable HTTP server",
      "type": "streamable_http",
      "transport": "streamable_http",
      "streamableHTTPOptions": {
        "headers": {
          "Authorization": "Bearer token",
          "X-API-Key": "your-api-key"
        },
        "sessionId": "optional-session-id"
      }
    }
  }
}`}
                </pre>
              </ScrollArea>
            </div>

            {/* JSON Input Area - Right Side */}
            <div className="w-full lg:w-1/2">
              <h4 className="text-sm font-medium mb-2">{t('mcpServers.import.jsonPlaceholder')}</h4>
              <div className="rounded-md h-[400px]">
                <Textarea
                  value={importJson}
                  onChange={(e) => {
                    setImportJson(e.target.value);
                    setImportError('');
                  }}
                  placeholder={t('mcpServers.import.jsonPlaceholder')}
                  className="font-mono text-sm w-full h-full resize-none rounded-md p-4"
                  style={{ minHeight: '100%' }}
                />
              </div>
              {importError && (
                <div className="mt-2 text-sm text-destructive flex items-start p-2 rounded-md bg-destructive/10">
                  <XCircle className="h-4 w-4 mr-2 flex-shrink-0 mt-0.5" />
                  <p>{importError}</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end space-x-2 mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              {t('mcpServers.actions.cancel')}
            </Button>
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={async () => {
                try {
                  await onImport(importJson);
                  handleClose();
                } catch (error) {
                  setImportError(error instanceof Error ? error.message : t('mcpServers.import.error.importFailed'));
                  toast({
                    title: t('common.error'),
                    description: t('mcpServers.import.error.importFailed'),
                    variant: 'destructive',
                  });
                }
              }}
            >
              {isSubmitting ? t('mcpServers.import.importing') : t('mcpServers.import.importServers')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ExportDialog({ open, onOpenChange, exportJson }: ExportDialogProps) {
  const { t } = useTranslation();
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  const { toast } = useToast();

  const copyToClipboard = () => {
    navigator.clipboard.writeText(exportJson).then(
      () => {
        setCopiedToClipboard(true);
        toast({
          title: t('common.success'),
          description: t('mcpServers.export.downloadSuccess', { count: 1 }),
          variant: 'default',
        });
        setTimeout(() => setCopiedToClipboard(false), 2000);
      },
      (_err) => {
        toast({
          title: t('common.error'),
          description: t('mcpServers.export.error.copyFailed'),
          variant: 'destructive',
        });
      }
    );
  };

  const downloadJson = () => {
    const blob = new Blob([exportJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mcp-servers-config.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: t('common.success'),
      description: t('mcpServers.export.downloadSuccess', { count: 1 }),
      variant: 'default',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t('mcpServers.export.title')}</DialogTitle>
          <DialogDescription>
            {t('mcpServers.export.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div className="relative rounded-md border overflow-hidden">
            <ScrollArea className="h-[300px]">
              <pre className="p-4 bg-slate-900 text-slate-50 text-xs whitespace-pre-wrap break-all">
                {exportJson}
              </pre>
            </ScrollArea>
            <div className="absolute top-2 right-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="text-foreground"
                      onClick={copyToClipboard}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      {copiedToClipboard ? t('mcpServers.actions.copied') : t('mcpServers.actions.copy')}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {t('mcpServers.export.copyTooltip')}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('mcpServers.actions.close')}
            </Button>
            <Button
              type="button"
              onClick={downloadJson}
            >
              <Download className="mr-2 h-4 w-4" />
              {t('mcpServers.actions.downloadJson')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
