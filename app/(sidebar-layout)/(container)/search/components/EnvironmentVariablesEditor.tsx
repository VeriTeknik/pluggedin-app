'use client';

import { AlertCircle, CheckCircle, Code, HelpCircle, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { UseFormReturn } from 'react-hook-form';

import { type EnvVariable } from '@/app/actions/registry-intelligence';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormControl, FormItem, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface EnvironmentVariablesEditorProps {
  form: UseFormReturn<any>;
  detectedVariables?: EnvVariable[];
}

interface EditableEnvVariable extends EnvVariable {
  id: string;
  isDetected?: boolean;
}

export function EnvironmentVariablesEditor({ form, detectedVariables }: EnvironmentVariablesEditorProps) {
  const [manualVars, setManualVars] = useState<EditableEnvVariable[]>([]);
  
  // Get current form value
  const currentVars = form.watch('environmentVariables') || [];

  // Merge detected and manual variables
  const allVariables: EditableEnvVariable[] = [
    ...(detectedVariables || []).map((v, idx) => ({
      ...v,
      id: `detected-${idx}`,
      isDetected: true
    })),
    ...manualVars
  ];

  const addVariable = () => {
    const newVar: EditableEnvVariable = {
      id: `manual-${Date.now()}`,
      name: '',
      description: '',
      required: false,
      isDetected: false
    };
    setManualVars([...manualVars, newVar]);
    
    // Update form
    const updatedVars = [...currentVars, {
      name: '',
      description: '',
      required: false
    }];
    form.setValue('environmentVariables', updatedVars);
  };

  const updateVariable = (id: string, field: keyof EnvVariable, value: any) => {
    const varIndex = allVariables.findIndex(v => v.id === id);
    if (varIndex === -1) return;

    const updatedVars = [...currentVars];
    updatedVars[varIndex] = {
      ...updatedVars[varIndex],
      [field]: value
    };
    form.setValue('environmentVariables', updatedVars);

    // Update manual vars if it's a manual variable
    if (!allVariables[varIndex].isDetected) {
      const manualIndex = manualVars.findIndex(v => v.id === id);
      if (manualIndex !== -1) {
        const updated = [...manualVars];
        updated[manualIndex] = { ...updated[manualIndex], [field]: value };
        setManualVars(updated);
      }
    }
  };

  const removeVariable = (id: string) => {
    const varIndex = allVariables.findIndex(v => v.id === id);
    if (varIndex === -1) return;

    // Remove from form
    const updatedVars = currentVars.filter((_: any, idx: number) => idx !== varIndex);
    form.setValue('environmentVariables', updatedVars);

    // Remove from manual vars if it's manual
    if (!allVariables[varIndex].isDetected) {
      setManualVars(manualVars.filter(v => v.id !== id));
    }
  };

  const getCommonEnvSuggestions = () => [
    { name: 'API_KEY', description: 'API authentication key' },
    { name: 'BASE_URL', description: 'Base URL for API endpoints' },
    { name: 'MODEL_NAME', description: 'Default model to use' },
    { name: 'TIMEOUT', description: 'Request timeout in seconds' },
    { name: 'DEBUG', description: 'Enable debug mode' }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code className="h-5 w-5" />
          Environment Variables
        </CardTitle>
        <CardDescription>
          Define the environment variables required for your MCP server
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {allVariables.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No environment variables configured. MCP servers often require API keys or configuration values.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            {allVariables.map((variable) => (
              <div
                key={variable.id}
                className={cn(
                  "p-4 rounded-lg border space-y-3",
                  variable.isDetected ? "bg-muted/50" : "bg-background"
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {variable.isDetected && (
                      <Badge variant="secondary" className="text-xs">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Detected
                      </Badge>
                    )}
                    {variable.required && (
                      <Badge variant="destructive" className="text-xs">
                        Required
                      </Badge>
                    )}
                  </div>
                  {!variable.isDetected && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeVariable(variable.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <FormItem>
                    <FormLabel>Variable Name</FormLabel>
                    <FormControl>
                      <Input
                        value={variable.name}
                        onChange={(e) => updateVariable(variable.id, 'name', e.target.value)}
                        placeholder="VARIABLE_NAME"
                        className="font-mono"
                        disabled={variable.isDetected}
                      />
                    </FormControl>
                  </FormItem>

                  <FormItem>
                    <FormLabel>Default Value (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        value={variable.defaultValue || ''}
                        onChange={(e) => updateVariable(variable.id, 'defaultValue', e.target.value)}
                        placeholder="Leave empty if none"
                      />
                    </FormControl>
                  </FormItem>
                </div>

                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input
                      value={variable.description}
                      onChange={(e) => updateVariable(variable.id, 'description', e.target.value)}
                      placeholder="What is this variable used for?"
                    />
                  </FormControl>
                </FormItem>

                <div className="flex items-center space-x-2">
                  <Switch
                    checked={variable.required}
                    onCheckedChange={(checked) => updateVariable(variable.id, 'required', checked)}
                    disabled={variable.isDetected && variable.required}
                  />
                  <label className="text-sm">
                    Required variable
                  </label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Required variables must be set for the server to function</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addVariable}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Variable
          </Button>

          {allVariables.length === 0 && (
            <div className="flex gap-2">
              <span className="text-sm text-muted-foreground">Common:</span>
              {getCommonEnvSuggestions().slice(0, 3).map((suggestion) => (
                <Button
                  key={suggestion.name}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    const newVar: EditableEnvVariable = {
                      id: `manual-${Date.now()}`,
                      name: suggestion.name,
                      description: suggestion.description,
                      required: false,
                      isDetected: false
                    };
                    setManualVars([newVar]);
                    form.setValue('environmentVariables', [{
                      name: suggestion.name,
                      description: suggestion.description,
                      required: false
                    }]);
                  }}
                >
                  {suggestion.name}
                </Button>
              ))}
            </div>
          )}
        </div>

        {detectedVariables && detectedVariables.length > 0 && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              Found {detectedVariables.length} environment variable{detectedVariables.length > 1 ? 's' : ''} in the repository documentation.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}