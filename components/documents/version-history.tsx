'use client';

import { format } from 'date-fns';
import {
  AlertCircle,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  FileText,
  RotateCcw} from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { type DocumentVersion,useDocumentVersions } from '@/lib/hooks/use-document-versions';
import { cn } from '@/lib/utils';

interface VersionHistoryProps {
  documentId: string;
  documentName: string;
  currentVersion?: number;
  onViewVersion: (versionNumber: number) => void;
  onRestoreVersion: (versionNumber: number) => void;
  onCompareVersions?: (version1: number, version2: number) => void;
}

export function VersionHistory({
  documentId,
  documentName,
  currentVersion,
  onViewVersion,
  onRestoreVersion,
  onCompareVersions,
}: VersionHistoryProps) {
  const [expandedVersions, setExpandedVersions] = useState<Set<number>>(new Set());
  const [selectedVersions, setSelectedVersions] = useState<Set<number>>(new Set());
  const { versions, isLoading, error } = useDocumentVersions(documentId);

  const toggleVersionExpanded = (versionNumber: number) => {
    const newExpanded = new Set(expandedVersions);
    if (newExpanded.has(versionNumber)) {
      newExpanded.delete(versionNumber);
    } else {
      newExpanded.add(versionNumber);
    }
    setExpandedVersions(newExpanded);
  };

  const toggleVersionSelection = (versionNumber: number) => {
    const newSelected = new Set(selectedVersions);
    if (newSelected.has(versionNumber)) {
      newSelected.delete(versionNumber);
    } else {
      // Only allow 2 versions to be selected for comparison
      if (newSelected.size >= 2) {
        const firstSelected = Array.from(newSelected)[0];
        newSelected.delete(firstSelected);
      }
      newSelected.add(versionNumber);
    }
    setSelectedVersions(newSelected);
  };

  const handleCompare = () => {
    if (selectedVersions.size === 2 && onCompareVersions) {
      const [v1, v2] = Array.from(selectedVersions);
      onCompareVersions(v1, v2);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Version History</CardTitle>
          <CardDescription>Loading versions...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const errorStatus = (error as any)?.status;

  if (errorStatus === 401 || errorStatus === 403 || errorStatus === 404) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Version History</CardTitle>
          <CardDescription>No versions available</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Version history is not available for this document yet.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Version History</CardTitle>
          <CardDescription>Error loading versions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">Failed to load version history</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!versions || versions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Version History</CardTitle>
          <CardDescription>No versions available</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No version history available for this document.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Version History</CardTitle>
            <CardDescription>
              {versions.length} version{versions.length !== 1 ? 's' : ''} available
            </CardDescription>
          </div>
          {onCompareVersions && selectedVersions.size === 2 && (
            <Button onClick={handleCompare} size="sm">
              Compare Selected
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-2">
            {versions.map((version: DocumentVersion) => {
              const isExpanded = expandedVersions.has(version.versionNumber);
              const isSelected = selectedVersions.has(version.versionNumber);
              const isCurrent = version.isCurrent || version.versionNumber === currentVersion;

              return (
                <Collapsible
                  key={version.versionNumber}
                  open={isExpanded}
                  onOpenChange={() => toggleVersionExpanded(version.versionNumber)}
                >
                  <div
                    className={cn(
                      "rounded-lg border p-3 transition-colors",
                      isCurrent && "bg-primary/5 border-primary",
                      isSelected && "bg-accent",
                      !isCurrent && !isSelected && "hover:bg-accent/50"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {onCompareVersions && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleVersionSelection(version.versionNumber)}
                            className="rounded border-gray-300"
                            aria-label={`Select version ${version.versionNumber}`}
                          />
                        )}
                        <div className="flex items-center gap-2">
                          <Badge variant={isCurrent ? "default" : "secondary"}>
                            v{version.versionNumber}
                          </Badge>
                          {isCurrent && (
                            <Badge variant="outline" className="text-xs">
                              <Check className="h-3 w-3 mr-1" />
                              Current
                            </Badge>
                          )}
                          {version.fileWritten ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="outline" className="text-xs">
                                    <FileText className="h-3 w-3" />
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>File saved to disk</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="outline" className="text-xs text-yellow-600">
                                    <AlertCircle className="h-3 w-3" />
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Database only (file write pending)</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(version.createdAt), 'MMM d, yyyy HH:mm')}
                        </span>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm">
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                      </div>
                    </div>

                    <CollapsibleContent>
                      <div className="mt-3 pt-3 border-t space-y-3">
                        {/* Creator info */}
                        {version.createdByModel && (
                          <div className="flex items-center gap-2 text-sm">
                            <Bot className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Created by:</span>
                            <span className="font-medium">
                              {version.createdByModel.name} ({version.createdByModel.provider})
                            </span>
                          </div>
                        )}

                        {/* Change summary */}
                        {version.changeSummary && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">Changes:</span>
                            <p className="mt-1">{version.changeSummary}</p>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onViewVersion(version.versionNumber)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                          {!isCurrent && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onRestoreVersion(version.versionNumber)}
                            >
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Restore
                            </Button>
                          )}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
