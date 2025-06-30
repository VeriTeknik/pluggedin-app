'use client';

import { AlertCircle, HelpCircle, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { McpServerType } from '@/db/schema';

export interface ExtractedConfig {
  name?: string;
  description?: string;
  command?: string;
  args?: string[];
  env?: Record<string, {
    description: string;
    required: boolean;
    example: string;
  }>;
  installation?: {
    npm?: string;
    pip?: string;
    docker?: string;
    binary?: string;
  };
  capabilities?: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
    logging?: boolean;
  };
  transport?: 'stdio' | 'sse' | 'streamable-http';
  url?: string;
}

export interface ExtractionResult {
  extracted_config: ExtractedConfig;
  confidence_scores: {
    overall: number;
    completeness: number;
  };
  warnings?: string[];
}

interface DynamicServerConfigFormProps {
  extractionResult?: ExtractionResult;
  onSubmit: (data: any) => void;
  isSubmitting?: boolean;
}

export function DynamicServerConfigForm({
  extractionResult,
  onSubmit,
  isSubmitting = false,
}: DynamicServerConfigFormProps) {
  const { t } = useTranslation();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const form = useForm({
    defaultValues: {
      name: '',
      description: '',
      type: McpServerType.STDIO,
      command: '',
      args: [] as string[],
      env: [] as { key: string; value: string; description?: string }[],
      url: '',
      capabilities: {
        tools: false,
        resources: false,
        prompts: false,
        logging: false,
      },
    },
  });

  const { fields: argFields, append: appendArg, remove: removeArg } = useFieldArray({
    control: form.control,
    name: 'args',
  });

  const { fields: envFields, append: appendEnv, remove: removeEnv } = useFieldArray({
    control: form.control,
    name: 'env',
  });

  // Update form when extraction result changes
  useEffect(() => {
    if (extractionResult?.extracted_config) {
      const config = extractionResult.extracted_config;
      
      // Basic fields
      if (config.name) form.setValue('name', config.name);
      if (config.description) form.setValue('description', config.description);
      if (config.command) form.setValue('command', config.command);
      if (config.url) form.setValue('url', config.url);
      
      // Set type based on transport or URL
      if (config.transport === 'streamable-http' || config.url) {
        form.setValue('type', McpServerType.STREAMABLE_HTTP);
      } else if (config.transport === 'sse') {
        form.setValue('type', McpServerType.SSE);
      } else {
        form.setValue('type', McpServerType.STDIO);
      }
      
      // Arguments
      if (config.args && config.args.length > 0) {
        form.setValue('args', config.args);
      }
      
      // Environment variables
      if (config.env) {
        const envArray = Object.entries(config.env).map(([key, info]) => ({
          key,
          value: info.example || '',
          description: info.description,
        }));
        form.setValue('env', envArray);
      }
      
      // Capabilities
      if (config.capabilities) {
        form.setValue('capabilities', config.capabilities);
      }
    }
  }, [extractionResult, form]);

  const handleSubmit = (data: any) => {
    // Convert env array back to object format
    const envObject: Record<string, string> = {};
    data.env.forEach((env: any) => {
      if (env.key) {
        envObject[env.key] = env.value;
      }
    });
    
    const submitData = {
      ...data,
      env: envObject,
    };
    
    onSubmit(submitData);
  };

  const confidenceScore = extractionResult?.confidence_scores?.overall || 0;
  const confidenceColor = confidenceScore > 0.7 ? 'text-green-600' : 
                         confidenceScore > 0.5 ? 'text-yellow-600' : 
                         'text-red-600';

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Confidence Score */}
        {extractionResult && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">AI Extraction Confidence</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Overall Confidence</span>
                <span className={`text-sm font-medium ${confidenceColor}`}>
                  {Math.round(confidenceScore * 100)}%
                </span>
              </div>
              <Progress value={confidenceScore * 100} className="h-2" />
              
              {extractionResult.warnings && extractionResult.warnings.length > 0 && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <ul className="list-disc list-inside space-y-1">
                      {extractionResult.warnings.map((warning, i) => (
                        <li key={i} className="text-sm">{warning}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              Server name and description
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Server Name</FormLabel>
                  <FormControl>
                    <Input placeholder="my-mcp-server" {...field} />
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
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="A brief description of what this server does..."
                      className="min-h-[80px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Server Type & Command */}
        <Card>
          <CardHeader>
            <CardTitle>Server Configuration</CardTitle>
            <CardDescription>
              How the server should be executed
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Server Type</FormLabel>
                  <FormControl>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2"
                      {...field}
                    >
                      <option value={McpServerType.STDIO}>STDIO (Command Line)</option>
                      <option value={McpServerType.STREAMABLE_HTTP}>Streamable HTTP</option>
                      <option value={McpServerType.SSE}>Server-Sent Events (SSE)</option>
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {form.watch('type') === McpServerType.STDIO && (
              <>
                <FormField
                  control={form.control}
                  name="command"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Command</FormLabel>
                      <FormControl>
                        <Input placeholder="npx" {...field} />
                      </FormControl>
                      <FormDescription>
                        The command to execute the server
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Arguments */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Arguments</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => appendArg('')}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Argument
                    </Button>
                  </div>
                  
                  {argFields.map((field, index) => (
                    <div key={field.id} className="flex gap-2">
                      <Input
                        {...form.register(`args.${index}`)}
                        placeholder="Argument"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeArg(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
            
            {(form.watch('type') === McpServerType.STREAMABLE_HTTP || 
              form.watch('type') === McpServerType.SSE) && (
              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Server URL</FormLabel>
                    <FormControl>
                      <Input 
                        type="url"
                        placeholder="https://api.example.com/mcp"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      The URL endpoint for the MCP server
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </CardContent>
        </Card>

        {/* Environment Variables */}
        <Card>
          <CardHeader>
            <CardTitle>Environment Variables</CardTitle>
            <CardDescription>
              Required environment variables for the server
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {envFields.map((field, index) => (
                <div key={field.id} className="space-y-2 p-4 border rounded-lg">
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-2">
                      <Input
                        {...form.register(`env.${index}.key`)}
                        placeholder="VARIABLE_NAME"
                      />
                      <Input
                        {...form.register(`env.${index}.value`)}
                        placeholder="Value or example"
                      />
                      {form.watch(`env.${index}.description`) && (
                        <p className="text-sm text-muted-foreground">
                          {form.watch(`env.${index}.description`)}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeEnv(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => appendEnv({ key: '', value: '', description: '' })}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Environment Variable
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Capabilities */}
        <Card>
          <CardHeader>
            <CardTitle>Capabilities</CardTitle>
            <CardDescription>
              What features does this server provide?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <FormField
              control={form.control}
              name="capabilities.tools"
              render={({ field }) => (
                <FormItem className="flex items-center space-x-2">
                  <FormControl>
                    <input
                      type="checkbox"
                      checked={field.value}
                      onChange={field.onChange}
                      className="h-4 w-4"
                    />
                  </FormControl>
                  <FormLabel className="!mt-0">Tools</FormLabel>
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="capabilities.resources"
              render={({ field }) => (
                <FormItem className="flex items-center space-x-2">
                  <FormControl>
                    <input
                      type="checkbox"
                      checked={field.value}
                      onChange={field.onChange}
                      className="h-4 w-4"
                    />
                  </FormControl>
                  <FormLabel className="!mt-0">Resources</FormLabel>
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="capabilities.prompts"
              render={({ field }) => (
                <FormItem className="flex items-center space-x-2">
                  <FormControl>
                    <input
                      type="checkbox"
                      checked={field.value}
                      onChange={field.onChange}
                      className="h-4 w-4"
                    />
                  </FormControl>
                  <FormLabel className="!mt-0">Prompts</FormLabel>
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="capabilities.logging"
              render={({ field }) => (
                <FormItem className="flex items-center space-x-2">
                  <FormControl>
                    <input
                      type="checkbox"
                      checked={field.value}
                      onChange={field.onChange}
                      className="h-4 w-4"
                    />
                  </FormControl>
                  <FormLabel className="!mt-0">Logging</FormLabel>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Submit Button */}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Adding Server...' : 'Add MCP Server'}
        </Button>
      </form>
    </Form>
  );
}