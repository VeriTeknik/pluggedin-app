'use client';

import 'prismjs/themes/prism-tomorrow.css';
// Import common languages
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-shell-session';

import { format } from 'date-fns';
import { Bot,Check, Copy, Download, FileText, X } from 'lucide-react';
import Prism from 'prismjs';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useVersionContent } from '@/lib/hooks/use-document-versions';

interface VersionViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  documentName: string;
  versionNumber: number;
  onRestore?: (versionNumber: number) => void;
}

function detectLanguage(content: string, filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();

  const extensionMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    py: 'python',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    cs: 'csharp',
    go: 'go',
    rs: 'rust',
    sql: 'sql',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    sh: 'bash',
    bash: 'bash',
  };

  return extensionMap[ext || ''] || 'plain';
}

export function VersionViewerModal({
  isOpen,
  onClose,
  documentId,
  documentName,
  versionNumber,
  onRestore,
}: VersionViewerModalProps) {
  const [copied, setCopied] = useState(false);
  const [highlightedContent, setHighlightedContent] = useState<string>('');
  const { content, version, isLoading, error } = useVersionContent(
    isOpen ? documentId : null,
    isOpen ? versionNumber : null
  );

  useEffect(() => {
    if (content) {
      const language = detectLanguage(content, documentName);
      try {
        const highlighted = Prism.highlight(
          content,
          Prism.languages[language] || Prism.languages.plain,
          language
        );
        setHighlightedContent(highlighted);
      } catch (err) {
        // Fallback to plain text if highlighting fails
        setHighlightedContent(content);
      }
    }
  }, [content, documentName]);

  const handleCopy = async () => {
    if (content) {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (content) {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${documentName.replace(/\.[^/.]+$/, '')}_v${versionNumber}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {documentName} - Version {versionNumber}
              </DialogTitle>
              <DialogDescription className="mt-2">
                {version && (
                  <div className="flex items-center gap-4 mt-2">
                    <span>
                      Created {format(new Date(version.createdAt), 'PPpp')}
                    </span>
                    {version.createdByModel && (
                      <div className="flex items-center gap-1">
                        <Bot className="h-4 w-4" />
                        <span>
                          {version.createdByModel.name} ({version.createdByModel.provider})
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="absolute right-4 top-4"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-destructive">Failed to load version content</p>
            </div>
          ) : (
            <Tabs defaultValue="formatted" className="h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <TabsList>
                  <TabsTrigger value="formatted">Formatted</TabsTrigger>
                  <TabsTrigger value="raw">Raw</TabsTrigger>
                </TabsList>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    disabled={!content}
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 mr-1" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-1" />
                        Copy
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownload}
                    disabled={!content}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                  {onRestore && !version?.isCurrent && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => onRestore(versionNumber)}
                    >
                      Restore This Version
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-hidden">
                <TabsContent value="formatted" className="h-full mt-0">
                  <ScrollArea className="h-full rounded-lg border bg-muted/30">
                    <pre className="p-4 text-sm overflow-x-auto">
                      <code
                        className="language-javascript"
                        dangerouslySetInnerHTML={{ __html: highlightedContent }}
                      />
                    </pre>
                  </ScrollArea>
                </TabsContent>
                <TabsContent value="raw" className="h-full mt-0">
                  <ScrollArea className="h-full rounded-lg border">
                    <pre className="p-4 text-sm font-mono whitespace-pre-wrap break-words">
                      {content}
                    </pre>
                  </ScrollArea>
                </TabsContent>
              </div>
            </Tabs>
          )}
        </div>

        {version?.changeSummary && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              <strong>Changes:</strong> {version.changeSummary}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}