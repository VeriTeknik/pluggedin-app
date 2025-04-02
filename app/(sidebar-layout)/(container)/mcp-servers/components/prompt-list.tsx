'use client';

import type { InferSelectModel } from 'drizzle-orm';
import { AlertTriangle, Loader2, MessageSquareText } from 'lucide-react'; // Use MessageSquareText icon
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
// Removed unused Badge import
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
// Removed unused Tooltip imports
import type { promptsTable } from '@/db/schema';

// Define fetcher function for SWR
const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) {
    throw new Error('Failed to fetch prompts');
  }
  return res.json();
});

// Define the expected type for a prompt item fetched from the API
type PromptItem = InferSelectModel<typeof promptsTable>;

interface PromptListProps {
  serverUuid: string;
}

export function PromptList({ serverUuid }: PromptListProps) {
  const { t } = useTranslation();
  const apiUrl = `/api/mcp-servers/${serverUuid}/prompts`;

  const { data: prompts, error, isLoading } = useSWR<PromptItem[]>(apiUrl, fetcher, {
    revalidateOnFocus: false,
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
        <AlertDescription>{t('mcpServers.errors.fetchPromptsFailed')}: {error.message}</AlertDescription>
      </Alert>
    );
  }

  if (!prompts || prompts.length === 0) {
    return (
      <Alert className="mt-4 border-blue-500/50 dark:border-blue-500/30">
        <MessageSquareText className="h-4 w-4" />
        <AlertTitle>{t('mcpServers.prompts.noPromptsTitle')}</AlertTitle>
        <AlertDescription>{t('mcpServers.prompts.noPrompts')}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-4 border rounded-md dark:border-slate-800">
      <Table>
        <TableHeader>
          <TableRow className="dark:border-slate-800">
            <TableHead>{t('mcpServers.prompts.name')}</TableHead>
            <TableHead>{t('mcpServers.prompts.description')}</TableHead>
            <TableHead>{t('mcpServers.prompts.arguments')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {prompts.map((prompt) => (
            <TableRow key={prompt.uuid} className="dark:border-slate-800">
              <TableCell className="font-medium flex items-center">
                 <MessageSquareText className="h-4 w-4 mr-2 text-muted-foreground" />
                 {prompt.name || <span className="text-muted-foreground italic">{t('common.notAvailable')}</span>}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {prompt.description || '-'}
              </TableCell>
              <TableCell>
                 {prompt.arguments_schema && Array.isArray(prompt.arguments_schema) && prompt.arguments_schema.length > 0 ? ( // Added Array.isArray check
                   <details className="text-xs">
                     <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{t('mcpServers.prompts.viewArguments', { count: prompt.arguments_schema.length })}</summary>
                     <pre className="mt-1 p-2 bg-muted dark:bg-slate-800 rounded text-xs overflow-auto max-h-40">
                       {/* Escape quotes for HTML */}
                       <code dangerouslySetInnerHTML={{ __html: JSON.stringify(prompt.arguments_schema, null, 2).replace(/"/g, '"') }} />
                     </pre>
                   </details>
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
