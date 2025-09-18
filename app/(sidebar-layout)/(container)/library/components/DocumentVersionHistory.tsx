'use client';

import { formatDistanceToNow } from 'date-fns';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  GitBranch,
  Minus,
  Plus,
  User
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ModelAttributionBadge } from '@/components/library/ModelAttributionBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DocumentVersion } from '@/types/document-versioning';

interface DocumentVersionHistoryProps {
  documentId: string;
  versions: DocumentVersion[];
  currentVersion: number;
  onVersionSelect?: (version: DocumentVersion) => void;
  onCompareVersions?: (v1: DocumentVersion, v2: DocumentVersion) => void;
}

export function DocumentVersionHistory({
  documentId,
  versions,
  currentVersion,
  onVersionSelect,
  onCompareVersions,
}: DocumentVersionHistoryProps) {
  const { t } = useTranslation('library');
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set());
  const [selectedVersions, setSelectedVersions] = useState<Set<string>>(new Set());
  const [compareMode, setCompareMode] = useState(false);

  const toggleVersionExpanded = (versionId: string) => {
    const newExpanded = new Set(expandedVersions);
    if (newExpanded.has(versionId)) {
      newExpanded.delete(versionId);
    } else {
      newExpanded.add(versionId);
    }
    setExpandedVersions(newExpanded);
  };

  const toggleVersionSelection = (versionId: string) => {
    const newSelected = new Set(selectedVersions);
    if (newSelected.has(versionId)) {
      newSelected.delete(versionId);
    } else {
      if (newSelected.size >= 2) {
        // Only allow 2 versions to be selected for comparison
        const firstSelected = Array.from(newSelected)[0];
        newSelected.delete(firstSelected);
      }
      newSelected.add(versionId);
    }
    setSelectedVersions(newSelected);
  };

  const handleCompare = () => {
    if (selectedVersions.size === 2 && onCompareVersions) {
      const [v1Id, v2Id] = Array.from(selectedVersions);
      const version1 = versions.find(v => v.id === v1Id);
      const version2 = versions.find(v => v.id === v2Id);
      if (version1 && version2) {
        onCompareVersions(version1, version2);
      }
    }
  };

  const sortedVersions = [...versions].sort((a, b) => b.version_number - a.version_number);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          {t('versionHistory.title', 'Version History')}
        </h3>
        <Button
          variant={compareMode ? 'default' : 'outline'}
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => {
            setCompareMode(!compareMode);
            setSelectedVersions(new Set());
          }}
        >
          {t('versionHistory.compareMode', 'Compare')}
        </Button>
      </div>
      {compareMode && selectedVersions.size === 2 && (
        <Button
          size="sm"
          className="w-full h-7 text-xs"
          onClick={handleCompare}
        >
          {t('versionHistory.compareSelected', 'Compare Selected')}
        </Button>
      )}
      <div className="space-y-2">
        {sortedVersions.map((version, index) => {
              const isExpanded = expandedVersions.has(version.id);
              const isSelected = selectedVersions.has(version.id);
              const isCurrent = version.version_number === currentVersion;
              const isFirst = index === 0;

              return (
                <div key={version.id} className="relative">
                  <div className="flex gap-4">
                    {/* Version content */}
                    <div className="flex-1 space-y-2">
                      <div
                        className={cn(
                          "p-3 rounded-lg border cursor-pointer transition-colors",
                          isSelected && "border-primary bg-primary/5",
                          !isSelected && "hover:bg-muted/50"
                        )}
                        onClick={() => {
                          if (compareMode) {
                            toggleVersionSelection(version.id);
                          } else {
                            toggleVersionExpanded(version.id);
                          }
                        }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleVersionExpanded(version.id);
                                }}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </Button>
                              <span className="font-medium">
                                {t('versionHistory.version', 'Version')} {version.version_number}
                              </span>
                              {isCurrent && (
                                <Badge variant="default" className="ml-2">
                                  {t('versionHistory.current', 'Current')}
                                </Badge>
                              )}
                              {compareMode && (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleVersionSelection(version.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="ml-auto"
                                  aria-label={`Select version ${version.version_number} for comparison`}
                                  title={`Select version ${version.version_number} for comparison`}
                                />
                              )}
                            </div>

                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <ModelAttributionBadge
                                modelName={version.created_by_model.name}
                                modelProvider={version.created_by_model.provider}
                                modelVersion={version.created_by_model.version}
                              />
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
                              </div>
                            </div>

                            {version.change_summary && (
                              <p className="text-sm text-muted-foreground mt-2">
                                {version.change_summary}
                              </p>
                            )}

                            {version.content_diff && (
                              <div className="flex items-center gap-3 mt-2">
                                {version.content_diff.additions !== undefined && (
                                  <div className="flex items-center gap-1 text-sm">
                                    <Plus className="h-3 w-3 text-green-600" />
                                    <span className="text-green-600">
                                      +{version.content_diff.additions}
                                    </span>
                                  </div>
                                )}
                                {version.content_diff.deletions !== undefined && (
                                  <div className="flex items-center gap-1 text-sm">
                                    <Minus className="h-3 w-3 text-red-600" />
                                    <span className="text-red-600">
                                      -{version.content_diff.deletions}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {!compareMode && onVersionSelect && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                onVersionSelect(version);
                              }}
                            >
                              <FileText className="h-4 w-4 mr-1" />
                              {t('versionHistory.view', 'View')}
                            </Button>
                          )}
                        </div>

                        {/* Expanded content */}
                        {isExpanded && version.content_diff?.changes && (
                          <div className="mt-3 pt-3 border-t">
                            <div className="space-y-2">
                              <h4 className="text-sm font-medium">
                                {t('versionHistory.changes', 'Changes')}
                              </h4>
                              <div className="space-y-1 text-sm">
                                {version.content_diff.changes.map((change, idx) => (
                                  <div
                                    key={idx}
                                    className={cn(
                                      "p-2 rounded font-mono text-xs",
                                      change.type === 'addition' && "bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100",
                                      change.type === 'deletion' && "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100",
                                      change.type === 'modification' && "bg-yellow-50 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-100"
                                    )}
                                  >
                                    <span className="font-semibold mr-2">
                                      {change.type === 'addition' && '+'}
                                      {change.type === 'deletion' && '-'}
                                      {change.type === 'modification' && '~'}
                                    </span>
                                    {change.content}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
      </div>
    </div>
  );
}