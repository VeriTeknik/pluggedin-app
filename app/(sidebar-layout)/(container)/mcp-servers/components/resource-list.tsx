'use client';

import type { InferSelectModel } from 'drizzle-orm';
import { AlertTriangle, FileText, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'; // Assuming correct path
import { Badge } from '@/components/ui/badge'; // Assuming correct path
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'; // Assuming correct path
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'; // Assuming correct path
import type { resourcesTable } from '@/db/schema';

// Define fetcher function for SWR
const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) {
    throw new Error('Failed to fetch resources');
  }
  return res.json();
});

// Define the expected type for a resource item fetched from the API
// This should match the structure returned by /api/mcp-servers/[uuid]/resources
type ResourceItem = InferSelectModel<typeof resourcesTable>;

interface ResourceListProps {
  serverUuid: string;
}

export function ResourceList({ serverUuid }: ResourceListProps) {
  const { t } = useTranslation();
  const apiUrl = `/api/mcp-servers/${serverUuid}/resources`;

  const { data: resources, error, isLoading } = useSWR<ResourceItem[]>(apiUrl, fetcher, {
    revalidateOnFocus: false, // Optional: prevent revalidation on window focus
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">{t('common.loading')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mt-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>{t('common.error')}</AlertTitle>
        <AlertDescription>{t('mcpServers.errors.fetchResourcesFailed')}: {error.message}</AlertDescription>
      </Alert>
    );
  }

  if (!resources || resources.length === 0) {
    // Use an Alert for better visibility, styled as informational/warning
    return (
      <Alert className="mt-4 border-blue-500/50 dark:border-blue-500/30">
        <FileText className="h-4 w-4" /> {/* Use a relevant icon */}
        <AlertTitle>{t('mcpServers.resources.noResourcesTitle', 'No Resources Found')}</AlertTitle> {/* Add a title key */}
        <AlertDescription>{t('mcpServers.resources.noResources', 'No static resources have been discovered for this server yet. Try running discovery.')}</AlertDescription>
      </Alert>
    );
  }

  // Only render table if resources exist
  return (
    <div className="mt-4 border rounded-md dark:border-slate-800">
      <Table>
        <TableHeader>
          <TableRow className="dark:border-slate-800">
            <TableHead>{t('mcpServers.resources.name')}</TableHead>
            <TableHead>{t('mcpServers.resources.uri')}</TableHead>
            <TableHead>{t('mcpServers.resources.description')}</TableHead>
            <TableHead>{t('mcpServers.resources.mimeType')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {resources.map((resource) => (
            <TableRow key={resource.uuid} className="dark:border-slate-800">
              <TableCell className="font-medium flex items-center">
                 <FileText className="h-4 w-4 mr-2 text-muted-foreground" />
                 {resource.name || <span className="text-muted-foreground italic">{t('common.notAvailable')}</span>}
              </TableCell>
              <TableCell>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="font-mono text-xs truncate cursor-default">{resource.uri}</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{resource.uri}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {resource.description || '-'}
              </TableCell>
              <TableCell>
                {resource.mime_type ? (
                  <Badge variant="outline" className="text-xs dark:border-slate-700">{resource.mime_type}</Badge>
                ) : (
                  '-'
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
