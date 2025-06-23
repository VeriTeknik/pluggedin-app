'use client';

// External imports
import { zodResolver } from '@hookform/resolvers/zod';
import type { InferSelectModel } from 'drizzle-orm';
import { AlertTriangle, Info, Loader2, Save } from 'lucide-react'; // Sorted icons
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import useSWR, { useSWRConfig } from 'swr';
import { z } from 'zod';

// Internal absolute imports (@/)
import { upsertCustomInstructions } from '@/app/actions/custom-instructions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { customInstructionsTable } from '@/db/schema';
import { useToast } from '@/hooks/use-toast';

// Define fetcher function for SWR
const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) {
    if (res.status === 404) return null; // Handle not found gracefully
    throw new Error('Failed to fetch custom instructions');
  }
  return res.json();
});

// Define the expected type for data fetched from the API
type CustomInstructionItem = InferSelectModel<typeof customInstructionsTable> | null;

// Define the expected type for form data based on the schema
// We'll define the actual schema inside the component where 't' is available
interface FormData {
  description?: string;
  messagesJson: string;
}

interface CustomInstructionsEditorProps {
  serverUuid: string;
  profileUuid: string; // Need profileUuid to call the action
}

export function CustomInstructionsEditor({ serverUuid, profileUuid }: CustomInstructionsEditorProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { mutate } = useSWRConfig(); // To revalidate SWR cache after saving
  const apiUrl = `/api/mcp-servers/${serverUuid}/custom-instructions`;

  // Define the Zod schema *inside* the component where 't' is available
  const formSchema = z.object({
    description: z.string().optional(),
    messagesJson: z.string().refine((val) => {
      try {
        const parsed = JSON.parse(val);
        // Basic validation: check if it's an array
        // More specific validation based on McpMessage type could be added here
        return Array.isArray(parsed);
      } catch (_e) {
        return false;
      }
    }, { message: t('settings.validation.invalidJsonArray') }), // Now 't' is accessible
  });

  const { data: instructions, error, isLoading } = useSWR(apiUrl, fetcher, {
    revalidateOnFocus: false,
  }) as { data: CustomInstructionItem; error: Error | undefined; isLoading: boolean };

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      description: '',
      messagesJson: '[]', // Default to empty JSON array string
    },
  });

  // Reset form when data loads
  useEffect(() => {
    if (instructions) {
      form.reset({
        description: instructions.description ?? '',
        messagesJson: JSON.stringify(instructions.messages ?? [], null, 2), // Pretty print JSON
      });
    } else if (!isLoading && !error) {
       // Handle case where instructions are null (not yet created)
       form.reset({ description: '', messagesJson: '[]' });
    }
  }, [instructions, form, isLoading, error]);

  const onSubmit = async (data: FormData) => {
    try {
      const messages = JSON.parse(data.messagesJson); // We know this is valid due to Zod refine
      const result = await upsertCustomInstructions(
        profileUuid,
        serverUuid,
        messages,
        data.description || null // Pass null if empty string
      );

      if (result.success) {
        toast({ title: t('common.success'), description: t('mcpServers.instructions.saveSuccess') });
        mutate(apiUrl); // Revalidate SWR cache for this endpoint
        form.reset(data); // Reset form to current saved values to clear dirty state
      } else {
        throw new Error(result.error || t('mcpServers.instructions.saveError'));
      }
    } catch (e: any) {
      toast({ title: t('common.error'), description: e.message, variant: 'destructive' });
    }
  };

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
        <AlertDescription>{t('mcpServers.errors.fetchInstructionsFailed')}: {error.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-4">
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('mcpServers.instructions.descriptionLabel')}</FormLabel>
              <FormControl>
                <Input placeholder={t('mcpServers.instructions.descriptionPlaceholder')} {...field} />
              </FormControl>
              <FormDescription>
                {t('mcpServers.instructions.descriptionHelp')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="messagesJson"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('mcpServers.instructions.messagesLabel')}</FormLabel>
              <FormControl>
                <Textarea
                  placeholder={t('mcpServers.instructions.messagesPlaceholder')}
                  className="min-h-[300px] font-mono text-sm"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                {t('mcpServers.instructions.messagesHelp')}
              </FormDescription>
              <FormMessage /> {/* Shows validation errors */}
            </FormItem>
          )}
        />

        <Alert variant="default" className="border-sky-500/50 dark:border-sky-500/30">
           <Info className="h-4 w-4" />
           <AlertTitle>{t('mcpServers.instructions.infoTitle')}</AlertTitle>
           <AlertDescription>
             {t('mcpServers.instructions.infoText')}
           </AlertDescription>
         </Alert>

        <Button type="submit" disabled={!form.formState.isDirty || form.formState.isSubmitting}>
          <Save className="mr-2 h-4 w-4" />
          {form.formState.isSubmitting ? t('common.saving') : t('common.saveChanges')}
        </Button>
      </form>
    </Form>
  );
}
