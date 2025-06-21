'use client';

import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { McpServerStatus, McpServerType } from '@/db/schema';

interface ServerFormProps {
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function StdioServerForm({ onSubmit, onCancel, isSubmitting }: ServerFormProps) {
  const { t } = useTranslation();
  const form = useForm({
    defaultValues: {
      name: '',
      description: '',
      command: '',
      args: '',
      env: '',
      type: McpServerType.STDIO,
    },
  });

  const handleSubmit = async (data: any) => {
    const processedData = {
      ...data,
      type: McpServerType.STDIO,
      args: data.args
        .split(',')
        .map((arg: string) => arg.trim())
        .filter(Boolean),
      env: Object.fromEntries(
        data.env
          .split('\n')
          .filter((line: string) => line.includes('='))
          .map((line: string) => {
            const [key, ...values] = line.split('=');
            return [key.trim(), values.join('=').trim()];
          })
      ),
      status: McpServerStatus.ACTIVE,
      url: undefined,
    };

    await onSubmit(processedData);
    form.reset();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('mcpServers.form.name')}</FormLabel>
              <FormControl>
                <Input {...field} placeholder={t('mcpServers.form.namePlaceholder')} required />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('mcpServers.form.description')}</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder={t('mcpServers.form.descriptionPlaceholder')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="command"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('mcpServers.form.command')}</FormLabel>
              <FormControl>
                <Input {...field} placeholder={t('mcpServers.form.commandPlaceholder')} required />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="args"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('mcpServers.form.arguments')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder={t('mcpServers.form.argumentsPlaceholder')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="env"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('mcpServers.form.envVars')}</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder={t('mcpServers.form.envVarsPlaceholder')}
                  className="font-mono text-sm"
                />
              </FormControl>
              <p className="text-sm text-muted-foreground">
                {t('mcpServers.form.envVarsHelp')}
              </p>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end space-x-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {t('mcpServers.actions.cancel')}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t('mcpServers.actions.creating') : t('mcpServers.actions.create')}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export function SseServerForm({ onSubmit, onCancel, isSubmitting }: ServerFormProps) {
  const { t } = useTranslation();
  const form = useForm({
    defaultValues: {
      name: '',
      description: '',
      url: '',
      type: McpServerType.SSE,
    },
  });

  const handleSubmit = async (data: any) => {
    const processedData = {
      ...data,
      type: McpServerType.SSE,
      args: [],
      env: {},
      status: McpServerStatus.ACTIVE,
      command: undefined,
    };

    await onSubmit(processedData);
    form.reset();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('mcpServers.form.name')}</FormLabel>
              <FormControl>
                <Input {...field} placeholder={t('mcpServers.form.namePlaceholder')} required />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('mcpServers.form.description')}</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder={t('mcpServers.form.descriptionPlaceholder')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('mcpServers.form.serverUrl')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder={t('mcpServers.form.serverUrlPlaceholder')}
                  required
                  pattern="^(http|https)://[^\s/$.?#].[^\s]*$"
                />
              </FormControl>
              <p className="text-sm text-muted-foreground">
                {t('mcpServers.form.serverUrlHelp')}
              </p>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end space-x-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {t('mcpServers.actions.cancel')}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t('mcpServers.actions.creating') : t('mcpServers.actions.create')}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export function StreamableHttpServerForm({ onSubmit, onCancel, isSubmitting }: ServerFormProps) {
  const { t } = useTranslation();
  const form = useForm({
    defaultValues: {
      name: '',
      description: '',
      url: '',
      type: McpServerType.STREAMABLE_HTTP,
      headers: '',
      sessionId: '',
    },
  });

  const handleSubmit = async (data: any) => {
    // Parse headers from string format
    const headers = Object.fromEntries(
      data.headers
        .split('\n')
        .filter((line: string) => line.includes(':'))
        .map((line: string) => {
          const [key, ...values] = line.split(':');
          return [key.trim(), values.join(':').trim()];
        })
    );

    const processedData = {
      ...data,
      type: McpServerType.STREAMABLE_HTTP,
      args: [],
      env: {},
      status: McpServerStatus.ACTIVE,
      command: undefined,
      transport: 'streamable_http',
      streamableHTTPOptions: {
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        sessionId: data.sessionId || undefined,
      },
    };

    await onSubmit(processedData);
    form.reset();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3 rounded-md">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            <strong>Note:</strong> Streamable HTTP support is experimental due to module resolution issues in Next.js. 
            The server will fall back to SSE transport until this is resolved.
          </p>
        </div>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('mcpServers.form.name')}</FormLabel>
              <FormControl>
                <Input {...field} placeholder={t('mcpServers.form.namePlaceholder')} required />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('mcpServers.form.description')}</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder={t('mcpServers.form.descriptionPlaceholder')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('mcpServers.form.serverUrl')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder={t('mcpServers.form.serverUrlPlaceholder')}
                  required
                  pattern="^(http|https)://[^\s/$.?#].[^\s]*$"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="headers"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('mcpServers.form.headers')}</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder={t('mcpServers.form.headersPlaceholder')}
                  className="font-mono text-sm"
                />
              </FormControl>
              <p className="text-sm text-muted-foreground">
                {t('mcpServers.form.headersHelp')}
              </p>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="sessionId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('mcpServers.form.sessionId')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder={t('mcpServers.form.sessionIdPlaceholder')}
                />
              </FormControl>
              <p className="text-sm text-muted-foreground">
                {t('mcpServers.form.sessionIdHelp')}
              </p>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end space-x-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {t('mcpServers.actions.cancel')}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t('mcpServers.actions.creating') : t('mcpServers.actions.create')}
          </Button>
        </div>
      </form>
    </Form>
  );
}