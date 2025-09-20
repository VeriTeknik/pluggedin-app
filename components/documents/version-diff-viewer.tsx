'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ArrowLeft, ArrowRight, FileText, Bot, Copy, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useVersionComparison } from '@/lib/hooks/use-document-versions';
import { cn } from '@/lib/utils';
import { diffLines, diffWords, Change } from 'diff';

interface VersionDiffViewerProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  documentName: string;
  version1: number;
  version2: number;
}

function DiffLine({ change, lineNumbers }: { change: Change; lineNumbers: { left: number; right: number } }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(change.value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        'group relative flex items-start font-mono text-sm',
        change.added && 'bg-green-500/10 text-green-700 dark:text-green-400',
        change.removed && 'bg-red-500/10 text-red-700 dark:text-red-400',
        !change.added && !change.removed && 'hover:bg-muted/50'
      )}
    >
      <div className="flex w-20 shrink-0 select-none">
        <span className="w-10 text-right pr-2 text-muted-foreground">
          {!change.added ? lineNumbers.left : ''}
        </span>
        <span className="w-10 text-right pr-2 text-muted-foreground">
          {!change.removed ? lineNumbers.right : ''}
        </span>
      </div>
      <pre className="flex-1 whitespace-pre-wrap break-all">
        <span className="pr-2 select-none text-muted-foreground">
          {change.added ? '+' : change.removed ? '-' : ' '}
        </span>
        {change.value}
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="opacity-0 group-hover:opacity-100 absolute right-2 top-1 h-6 w-6"
        onClick={handleCopy}
      >
        {copied ? (
          <Check className="h-3 w-3" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
}

function SideBySideView({ content1, content2 }: { content1: string; content2: string }) {
  const lines1 = content1.split('\n');
  const lines2 = content2.split('\n');
  const maxLines = Math.max(lines1.length, lines2.length);

  const changes = diffWords(content1, content2);
  const changedLines = new Set<number>();

  let pos1 = 0;
  let line1 = 0;
  for (const change of changes) {
    const lines = change.value.split('\n').length - 1;
    if (change.removed) {
      for (let i = 0; i < lines; i++) {
        changedLines.add(line1 + i);
      }
      line1 += lines;
    } else if (!change.added) {
      line1 += lines;
    }
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 border-r">
        <div className="sticky top-0 z-10 bg-background border-b p-2">
          <Badge variant="outline">Version 1</Badge>
        </div>
        <ScrollArea className="h-[calc(100%-40px)]">
          <div className="p-4">
            {lines1.map((line, idx) => (
              <div
                key={idx}
                className={cn(
                  'flex font-mono text-sm hover:bg-muted/30',
                  changedLines.has(idx) && 'bg-red-500/10'
                )}
              >
                <span className="w-12 text-right pr-2 text-muted-foreground select-none">
                  {idx + 1}
                </span>
                <pre className="flex-1 whitespace-pre-wrap break-all">{line}</pre>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1">
        <div className="sticky top-0 z-10 bg-background border-b p-2">
          <Badge variant="outline">Version 2</Badge>
        </div>
        <ScrollArea className="h-[calc(100%-40px)]">
          <div className="p-4">
            {lines2.map((line, idx) => (
              <div
                key={idx}
                className={cn(
                  'flex font-mono text-sm hover:bg-muted/30',
                  idx >= lines1.length && 'bg-green-500/10'
                )}
              >
                <span className="w-12 text-right pr-2 text-muted-foreground select-none">
                  {idx + 1}
                </span>
                <pre className="flex-1 whitespace-pre-wrap break-all">{line}</pre>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

export function VersionDiffViewer({
  isOpen,
  onClose,
  documentId,
  documentName,
  version1,
  version2,
}: VersionDiffViewerProps) {
  const { content1, content2, isLoading } = useVersionComparison(documentId, version1, version2);
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');

  const getDiffLines = (): Change[] => {
    if (!content1 || !content2) return [];
    return diffLines(content1, content2);
  };

  const diffLinesResult = getDiffLines();
  let leftLineNumber = 1;
  let rightLineNumber = 1;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Compare Versions: {documentName}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <Badge variant="secondary">v{version1}</Badge>
            <ArrowRight className="h-4 w-4" />
            <Badge variant="secondary">v{version2}</Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : !content1 || !content2 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Unable to load version content</p>
            </div>
          ) : (
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'unified' | 'split')} className="h-full flex flex-col">
              <TabsList className="grid w-[200px] grid-cols-2 mx-auto">
                <TabsTrigger value="unified">Unified</TabsTrigger>
                <TabsTrigger value="split">Side by Side</TabsTrigger>
              </TabsList>

              <TabsContent value="unified" className="flex-1 overflow-hidden mt-4">
                <ScrollArea className="h-full rounded-lg border">
                  <div className="p-4">
                    {diffLinesResult.map((change, idx) => {
                      const lines = change.value.split('\n').filter(l => l);
                      return lines.map((line, lineIdx) => {
                        const currentLeft = !change.added ? leftLineNumber++ : leftLineNumber;
                        const currentRight = !change.removed ? rightLineNumber++ : rightLineNumber;

                        return (
                          <DiffLine
                            key={`${idx}-${lineIdx}`}
                            change={{ ...change, value: line }}
                            lineNumbers={{ left: currentLeft - 1, right: currentRight - 1 }}
                          />
                        );
                      });
                    })}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="split" className="flex-1 overflow-hidden mt-4">
                <div className="h-full rounded-lg border overflow-hidden">
                  <SideBySideView content1={content1} content2={content2} />
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>

        <div className="flex justify-between items-center pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            {diffLinesResult.filter(d => d.added).reduce((acc, d) => acc + d.value.split('\n').length - 1, 0)} additions,{' '}
            {diffLinesResult.filter(d => d.removed).reduce((acc, d) => acc + d.value.split('\n').length - 1, 0)} deletions
          </div>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}