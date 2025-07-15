'use client';

import { 
  AlertCircle, 
  Check,
  Code,
  Edit,
  Eye,
  EyeOff,
  FileCode, 
  FileText, 
  Info, 
  Loader2,
  Plus, 
  RotateCcw,
  Save,
  Terminal,
  Trash2,
  X} from 'lucide-react';
import { useEffect,useState } from 'react';
import { useTranslation } from 'react-i18next';

import { fetchRegistryServer } from '@/app/actions/registry-servers';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

import { WizardData } from '../useWizardState';

interface EnvVarConfigStepProps {
  data: WizardData;
  onUpdate: (updates: Partial<WizardData>) => void;
}

interface EnvVar {
  name: string;
  description?: string;
  defaultValue?: string;
  required: boolean;
  source: 'readme' | 'env-example' | 'code' | 'manual' | 'registry' | 'args';
  value?: string;
  isSecret?: boolean;
  originalName?: string;
  originalDescription?: string;
  originalRequired?: boolean;
  originalIsSecret?: boolean;
}

export function EnvVarConfigStep({ data, onUpdate }: EnvVarConfigStepProps) {
  const { t } = useTranslation('registry');
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [editingVars, setEditingVars] = useState<Record<number, boolean>>({});
  const { toast } = useToast();

  // Initialize from wizard data or detect on mount
  useEffect(() => {
    if (data.detectedEnvVars && data.detectedEnvVars.length > 0) {
      // Already have detected vars, initialize with them
      setEnvVars(data.detectedEnvVars.map(v => ({
        ...v,
        value: data.configuredEnvVars?.[v.name] || v.defaultValue || '',
        isSecret: v.name.toLowerCase().includes('key') || 
                  v.name.toLowerCase().includes('token') ||
                  v.name.toLowerCase().includes('secret') ||
                  v.name.toLowerCase().includes('password'),
        // Store original values for reset functionality
        originalName: v.name,
        originalDescription: v.description,
        originalRequired: v.required,
        originalIsSecret: v.isSecret
      })));
    } else {
      // Detect environment variables
      detectEnvironmentVariables();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update wizard data when env vars change
  useEffect(() => {
    const configured: Record<string, string> = {};
    envVars.forEach(v => {
      if (v.value) {
        configured[v.name] = v.value;
      }
    });

    onUpdate({
      detectedEnvVars: envVars,
      configuredEnvVars: configured
    });
  }, [envVars, onUpdate]);

  const detectEnvironmentVariables = async () => {
    setIsDetecting(true);
    const detectedVars: EnvVar[] = [];
    const seenVars = new Set<string>();

    try {
      // First, call the analyze repository API to get transport configs
      const response = await fetch(`/api/analyze-repository?url=${encodeURIComponent(data.githubUrl!)}`);
      
      if (response.ok) {
        const result = await response.json();
        
        // Store transport configurations
        if (result.transportConfigs) {
          onUpdate({ detectedTransportConfigs: result.transportConfigs });
        }
        
        // Add environment variables from the API
        if (result.envVariables?.length > 0) {
          result.envVariables.forEach((envVar: any) => {
            if (!seenVars.has(envVar.name)) {
              seenVars.add(envVar.name);
              const newVar = {
                name: envVar.name,
                description: envVar.description || `Environment variable`,
                defaultValue: '',
                required: envVar.required !== false,
                source: 'args' as const,
                value: '',
                isSecret: envVar.isSecret || false
              };
              detectedVars.push({
                ...newVar,
                originalName: newVar.name,
                originalDescription: newVar.description,
                originalRequired: newVar.required,
                originalIsSecret: newVar.isSecret
              });
            }
          });
        }
      }
      
      // Also check transport configurations for env vars
      if (data.transportConfigs) {
        Object.values(data.transportConfigs).forEach(config => {
          // Check regular environment variables
          if (config.env) {
            Object.entries(config.env).forEach(([name, value]) => {
              if (!seenVars.has(name)) {
                seenVars.add(name);
                detectedVars.push({
                  name,
                  description: `Environment variable from ${config.source || 'detection'}`,
                  defaultValue: value || '',
                  required: true,
                  source: 'registry',
                  value: value || '',
                  isSecret: name.toLowerCase().includes('key') || 
                           name.toLowerCase().includes('token') ||
                           name.toLowerCase().includes('secret') ||
                           name.toLowerCase().includes('password')
                });
              }
            });
          }
          
          // Check headers for API keys or tokens
          if (config.headers) {
            Object.entries(config.headers).forEach(([key, value]) => {
              // Look for common auth header patterns
              if (key.toLowerCase() === 'authorization' || 
                  key.toLowerCase().includes('api-key') ||
                  key.toLowerCase().includes('x-api-key')) {
                // Extract placeholder from value (e.g., "Bearer ${API_KEY}")
                const matches = value.toString().match(/\$\{([^}]+)\}/g);
                if (matches) {
                  matches.forEach(match => {
                    const varName = match.slice(2, -1); // Remove ${ and }
                    if (!seenVars.has(varName)) {
                      seenVars.add(varName);
                      detectedVars.push({
                        name: varName,
                        description: `API key for ${key} header`,
                        defaultValue: '',
                        required: true,
                        source: 'args',
                        value: '',
                        isSecret: true
                      });
                    }
                  });
                }
              }
            });
          }
          
          // Check OAuth configuration
          if (config.oauth?.clientId && config.oauth.clientId.includes('${')) {
            const matches = config.oauth.clientId.match(/\$\{([^}]+)\}/g);
            if (matches) {
              matches.forEach(match => {
                const varName = match.slice(2, -1);
                if (!seenVars.has(varName)) {
                  seenVars.add(varName);
                  detectedVars.push({
                    name: varName,
                    description: 'OAuth Client ID',
                    defaultValue: '',
                    required: true,
                    source: 'args',
                    value: '',
                    isSecret: true
                  });
                }
              });
            }
          }
        });
      }

      // If this is a registry server, fetch env vars from registry
      if (data.githubUrl) {
        const match = data.githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (match) {
          const [, owner, repo] = match;
          const registryId = `io.github.${owner}/${repo}`;
          
          const result = await fetchRegistryServer(registryId);
          if (result.success && result.data) {
            const server = result.data;
            const primaryPackage = server.packages?.[0];
            
            if (primaryPackage?.environment_variables) {
              primaryPackage.environment_variables.forEach((envVar: any) => {
                if (!seenVars.has(envVar.name)) {
                  seenVars.add(envVar.name);
                  detectedVars.push({
                    name: envVar.name,
                    description: envVar.description,
                    defaultValue: envVar.defaultValue || '',
                    required: envVar.required !== false,
                    source: 'registry',
                    value: envVar.defaultValue || '',
                    isSecret: envVar.name.toLowerCase().includes('key') || 
                             envVar.name.toLowerCase().includes('token') ||
                             envVar.name.toLowerCase().includes('secret') ||
                             envVar.name.toLowerCase().includes('password')
                  });
                }
              });
            }
          }
        }
      }

      // If no vars from registry, add common MCP environment variables
      if (detectedVars.length === 0) {
        // Check if this looks like it needs API keys based on repo name
        const repoName = data.repo?.toLowerCase() || '';
        
        if (repoName.includes('github')) {
          detectedVars.push({
            name: 'GITHUB_PERSONAL_ACCESS_TOKEN',
            description: 'GitHub personal access token for API access',
            required: true,
            source: 'manual',
            isSecret: true,
            value: ''
          });
        }
        
        if (repoName.includes('notion')) {
          detectedVars.push({
            name: 'NOTION_API_KEY',
            description: 'Notion integration token',
            required: true,
            source: 'manual',
            isSecret: true,
            value: ''
          });
        }
        
        if (repoName.includes('slack')) {
          detectedVars.push({
            name: 'SLACK_BOT_TOKEN',
            description: 'Slack bot user OAuth token',
            required: true,
            source: 'manual',
            isSecret: true,
            value: ''
          });
        }

        if (repoName.includes('openai') || repoName.includes('gpt')) {
          detectedVars.push({
            name: 'OPENAI_API_KEY',
            description: 'OpenAI API key',
            required: true,
            source: 'manual',
            isSecret: true,
            value: ''
          });
        }
      }

      setEnvVars(detectedVars);
      
      if (detectedVars.length > 0) {
        toast({
          title: t('envConfig.toast.detected'),
          description: t('envConfig.toast.detectedDescription', {
            count: detectedVars.length,
            plural: detectedVars.length > 1 ? 's' : ''
          }),
        });
      }
    } catch (error) {
      console.error('Error detecting environment variables:', error);
      toast({
        title: t('envConfig.toast.detectionFailed'),
        description: t('envConfig.toast.detectionFailedDescription'),
        variant: 'destructive',
      });
    } finally {
      setIsDetecting(false);
    }
  };

  const addManualEnvVar = () => {
    const newVar: EnvVar = {
      name: '',
      description: '',
      required: false,
      source: 'manual',
      value: '',
      isSecret: false
    };
    setEnvVars([...envVars, newVar]);
  };

  const updateEnvVar = (index: number, updates: Partial<EnvVar>) => {
    const updated = [...envVars];
    updated[index] = { ...updated[index], ...updates };
    
    // Auto-detect if it's a secret based on name
    if (updates.name) {
      const nameLower = updates.name.toLowerCase();
      updated[index].isSecret = nameLower.includes('key') || 
                                nameLower.includes('token') ||
                                nameLower.includes('secret') ||
                                nameLower.includes('password');
    }
    
    setEnvVars(updated);
  };

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  const toggleShowSecret = (varName: string) => {
    setShowSecrets(prev => ({ ...prev, [varName]: !prev[varName] }));
  };

  const toggleEditMode = (index: number) => {
    setEditingVars(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const saveEdit = (index: number) => {
    setEditingVars(prev => ({ ...prev, [index]: false }));
  };

  const cancelEdit = (index: number) => {
    // Reset to original values if needed
    setEditingVars(prev => ({ ...prev, [index]: false }));
  };

  const resetToOriginal = (index: number) => {
    const envVar = envVars[index];
    if (envVar.originalName) {
      updateEnvVar(index, {
        name: envVar.originalName,
        description: envVar.originalDescription,
        required: envVar.originalRequired || false,
        isSecret: envVar.originalIsSecret || false
      });
    }
    setEditingVars(prev => ({ ...prev, [index]: false }));
  };


  const hasBeenModified = (envVar: EnvVar): boolean => {
    return envVar.source !== 'manual' && (
      envVar.name !== envVar.originalName ||
      envVar.description !== envVar.originalDescription ||
      envVar.required !== envVar.originalRequired ||
      envVar.isSecret !== envVar.originalIsSecret
    );
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'readme':
        return <FileText className="h-3 w-3" />;
      case 'env-example':
        return <FileCode className="h-3 w-3" />;
      case 'code':
        return <Code className="h-3 w-3" />;
      case 'registry':
        return <Check className="h-3 w-3" />;
      default:
        return <Plus className="h-3 w-3" />;
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'readme':
        return 'README';
      case 'env-example':
        return '.env.example';
      case 'code':
        return 'Code';
      case 'registry':
        return 'Registry';
      default:
        return 'Manual';
    }
  };

  // const areRequiredVarsFilled = () => {
  //   return envVars.filter(v => v.required).every(v => v.value && v.value.trim() !== '');
  // };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">{t('envConfig.title')}</h2>
        <p className="text-muted-foreground">
          {t('envConfig.description')}
        </p>
      </div>

      {isDetecting && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertDescription>
            {t('envConfig.loading')}
          </AlertDescription>
        </Alert>
      )}

      {/* Display detected command and args */}
      {data.detectedTransportConfigs && Object.keys(data.detectedTransportConfigs).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              Detected MCP Configuration
            </CardTitle>
            <CardDescription>
              Command and arguments detected from the repository
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(data.detectedTransportConfigs).map(([serverName, config]) => (
              <div key={serverName} className="space-y-2">
                <Label className="text-sm font-medium">{serverName}</Label>
                <div className="bg-muted p-3 rounded-md font-mono text-sm space-y-1">
                  {config.command && (
                    <div>
                      <span className="text-muted-foreground">Command:</span> {config.command}
                    </div>
                  )}
                  {config.args && config.args.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">Args:</span> {JSON.stringify(config.args)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!isDetecting && envVars.length === 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            No environment variables detected. You can add them manually if needed.
          </AlertDescription>
        </Alert>
      )}

      {envVars.length > 0 && (
        <div className="space-y-4">
          {envVars.map((envVar, index) => (
            <Card 
              key={index} 
              className={editingVars[index] ? "border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20" : ""}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {(envVar.source === 'manual' && envVar.name === '') || editingVars[index] ? (
                      <Input
                        placeholder={t('envConfig.variable.namePlaceholder')}
                        value={envVar.name}
                        onChange={(e) => updateEnvVar(index, { name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })}
                        className="font-mono text-sm mb-2"
                      />
                    ) : (
                      <div className="space-y-2">
                        <CardTitle className="text-sm font-mono flex items-center gap-2">
                          {envVar.name}
                          {envVar.required && (
                            <Badge variant="destructive" className="text-xs">{t('envConfig.variable.required')}</Badge>
                          )}
                          {envVar.isSecret && (
                            <Badge variant="secondary" className="text-xs">{t('envConfig.variable.secret')}</Badge>
                          )}
                        </CardTitle>
                        {editingVars[index] && (
                          <div className="flex items-center gap-4 text-xs">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id={`required-${index}`}
                                checked={envVar.required}
                                onCheckedChange={(checked) => 
                                  updateEnvVar(index, { required: !!checked })
                                }
                              />
                              <Label htmlFor={`required-${index}`}>{t('envConfig.variable.required')}</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id={`secret-${index}`}
                                checked={envVar.isSecret}
                                onCheckedChange={(checked) => 
                                  updateEnvVar(index, { isSecret: !!checked })
                                }
                              />
                              <Label htmlFor={`secret-${index}`}>{t('envConfig.variable.secret')}</Label>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {(envVar.description || envVar.source === 'manual' || editingVars[index]) && (
                      <CardDescription className="mt-1">
                        {(envVar.source === 'manual' && !envVar.description) || editingVars[index] ? (
                          <Textarea
                            placeholder={t('envConfig.variable.descriptionPlaceholder')}
                            value={envVar.description || ''}
                            onChange={(e) => updateEnvVar(index, { description: e.target.value })}
                            className="text-xs h-16 mt-1"
                          />
                        ) : (
                          envVar.description
                        )}
                      </CardDescription>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs flex items-center gap-1">
                      {getSourceIcon(envVar.source)}
                      {getSourceLabel(envVar.source)}
                    </Badge>
                    {hasBeenModified(envVar) && (
                      <Badge variant="secondary" className="text-xs">Modified</Badge>
                    )}
                    {editingVars[index] ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => saveEdit(index)}
                          title="Save changes"
                        >
                          <Save className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => cancelEdit(index)}
                          title="Cancel editing"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </>
                    ) : (
                      <>
                        {envVar.source !== 'manual' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => toggleEditMode(index)}
                            title="Edit variable"
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                        )}
                        {hasBeenModified(envVar) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => resetToOriginal(index)}
                            title="Reset to original"
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        )}
                        {envVar.source === 'manual' ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => removeEnvVar(index)}
                            title={`Delete ${envVar.name}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        ) : (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                title={`Delete ${envVar.name}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Environment Variable</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete the discovered variable &quot;{envVar.name}&quot;? 
                                  This was detected from {getSourceLabel(envVar.source)} and may be required for the server to function properly.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => removeEnvVar(index)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor={`env-${index}`} className="text-xs">
                    Value
                  </Label>
                  <div className="relative">
                    <Input
                      id={`env-${index}`}
                      type={envVar.isSecret && !showSecrets[envVar.name] ? 'password' : 'text'}
                      placeholder={envVar.defaultValue || `Enter ${envVar.name}`}
                      value={envVar.value || ''}
                      onChange={(e) => updateEnvVar(index, { value: e.target.value })}
                      className="font-mono text-sm pr-10"
                    />
                    {envVar.isSecret && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1 h-7 w-7"
                        onClick={() => toggleShowSecret(envVar.name)}
                      >
                        {showSecrets[envVar.name] ? (
                          <EyeOff className="h-3 w-3" />
                        ) : (
                          <Eye className="h-3 w-3" />
                        )}
                      </Button>
                    )}
                  </div>
                  {envVar.defaultValue && envVar.value !== envVar.defaultValue && (
                    <p className="text-xs text-muted-foreground">
                      Default: {envVar.defaultValue}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={addManualEnvVar}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          {t('envConfig.actions.addVariable')}
        </Button>

        <div className="flex items-center gap-2">
          {envVars.some(v => v.required && (!v.value || v.value.trim() === '')) && (
            <Alert className="p-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Please fill in all required variables
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}