'use client';

import type { InferSelectModel } from 'drizzle-orm';
import { AlertTriangle, FileCode, Loader2 } from 'lucide-react'; // Use FileCode icon
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { resourceTemplatesTable } from '@/db/schema';

// Define fetcher function for SWR
const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) {
    throw new Error('Failed to fetch resource templates');
  }
  return res.json();
});

// Define the expected type for a template item fetched from the API
type ResourceTemplateItem = InferSelectModel<typeof resourceTemplatesTable>;

interface ResourceTemplateListProps {
  serverUuid: string;
}

export function ResourceTemplateList({ serverUuid }: ResourceTemplateListProps) {
  const { t } = useTranslation();
  const apiUrl = `/api/mcp-servers/${serverUuid}/resource-templates`;

  const { data: templates, error, isLoading } = useSWR(apiUrl, fetcher, {
    revalidateOnFocus: false,
  }) as { data: ResourceTemplateItem[]; error: Error | undefined; isLoading: boolean };

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
        <AlertDescription>{t('mcpServers.errors.fetchTemplatesFailed')}: {error.message}</AlertDescription>
      </Alert>
    );
  }

  if (!templates || templates.length === 0) {
    return (
      <Alert className="mt-4 border-blue-500/50 dark:border-blue-500/30">
        <FileCode className="h-4 w-4" />
        <AlertTitle>{t('mcpServers.templates.noTemplatesTitle')}</AlertTitle>
        <AlertDescription>{t('mcpServers.templates.noTemplates')}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-4 border rounded-md dark:border-slate-800">
      <Table>
        <TableHeader>
          <TableRow className="dark:border-slate-800">
            <TableHead>{t('mcpServers.templates.name')}</TableHead>
            <TableHead>{t('mcpServers.templates.uriTemplate')}</TableHead>
            <TableHead>{t('mcpServers.templates.variables')}</TableHead>
            <TableHead>{t('mcpServers.templates.description')}</TableHead>
            <TableHead>{t('mcpServers.templates.mimeType')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {templates.map((template: ResourceTemplateItem) => (
            <TableRow key={template.uuid} className="dark:border-slate-800">
              <TableCell className="font-medium flex items-center">
                 <FileCode className="h-4 w-4 mr-2 text-muted-foreground" />
                 {template.name || <span className="text-muted-foreground italic">{t('common.notAvailable')}</span>}
              </TableCell>
              <TableCell>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="font-mono text-xs truncate cursor-default">{template.uri_template}</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{template.uri_template}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableCell>
               <TableCell>
                 {template.template_variables && template.template_variables.length > 0 ? (
                   <div className="flex flex-wrap gap-1">
                     {template.template_variables.map((variable: string) => (
                       <Badge key={variable} variant="secondary" className="font-mono text-xs">{variable}</Badge>
                     ))}
                   </div>
                 ) : (
                   '-'
                 )}
               </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {template.description || '-'}
              </TableCell>
              <TableCell>
                {template.mime_type ? (
                  <Badge variant="outline" className="text-xs dark:border-slate-700">{template.mime_type}</Badge>
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
