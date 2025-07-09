'use client';

import { 
  AlertCircle, 
  CheckCircle, 
  Code, 
  ExternalLink, 
  Eye, 
  FileText,
  GitBranch, 
  Github, 
  Info, 
  Loader2,
  Package,
  Server,
  Tag,
  Upload 
} from 'lucide-react';
import { useState } from 'react';

import { submitWizardToRegistry } from '@/app/actions/registry-servers';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

import { WizardData } from '../useWizardState';

interface RegistrySubmitStepProps {
  data: WizardData;
  onUpdate: (updates: Partial<WizardData>) => void;
  onSuccess: () => void;
  setIsSubmitting: (value: boolean) => void;
}

interface SubmissionState {
  step: 'review' | 'submitting' | 'success' | 'error';
  progress: number;
  message: string;
  error?: string;
  serverId?: string;
}

export function RegistrySubmitStep({ data, onUpdate, onSuccess, setIsSubmitting }: RegistrySubmitStepProps) {
  const [submissionState, setSubmissionState] = useState<SubmissionState>({
    step: 'review',
    progress: 0,
    message: ''
  });
  const [customDescription, setCustomDescription] = useState(data.customDescription || '');
  const [categories, setCategories] = useState<string[]>(data.categories || []);
  const [newCategory, setNewCategory] = useState('');
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!data.owner || !data.repo || !data.githubUrl) {
      toast({
        title: 'Missing repository information',
        description: 'Please go back and provide a valid GitHub repository.',
        variant: 'destructive'
      });
      return;
    }

    if (!data.configuredEnvVars && data.detectedEnvVars?.some(v => v.required)) {
      toast({
        title: 'Missing required environment variables',
        description: 'Please configure all required environment variables.',
        variant: 'destructive'
      });
      return;
    }

    setIsSubmitting(true);
    setSubmissionState({ step: 'submitting', progress: 0, message: 'Preparing submission...' });

    try {
      // Step 1: Validate data
      setSubmissionState({ step: 'submitting', progress: 20, message: 'Validating configuration...' });
      await new Promise(resolve => setTimeout(resolve, 500));

      // Step 2: Check GitHub ownership (if claiming)
      if (data.shouldClaim) {
        setSubmissionState({ step: 'submitting', progress: 40, message: 'Verifying GitHub ownership...' });
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Step 3: Prepare registry data
      setSubmissionState({ step: 'submitting', progress: 60, message: 'Preparing registry submission...' });
      
      // Update wizard data with final metadata
      onUpdate({
        customDescription,
        categories,
        finalDescription: customDescription || data.repoInfo?.description || '',
      });

      // Step 4: Submit to registry
      setSubmissionState({ step: 'submitting', progress: 80, message: 'Submitting to registry...' });
      
      // Call the actual server action
      const result = await submitWizardToRegistry({
        githubUrl: data.githubUrl!,
        owner: data.owner!,
        repo: data.repo!,
        repoInfo: data.repoInfo,
        shouldClaim: data.shouldClaim,
        configuredEnvVars: data.configuredEnvVars,
        detectedEnvVars: data.detectedEnvVars,
        transportConfigs: data.transportConfigs,
        finalDescription: customDescription || data.repoInfo?.description || '',
        categories,
      });
      
      if (result.success) {
        const serverId = result.serverId || `io.github.${data.owner}/${data.repo}`;
        
        setSubmissionState({ 
          step: 'success', 
          progress: 100, 
          message: 'Successfully submitted to registry!',
          serverId
        });

        onUpdate({ 
          submissionResult: { 
            success: true, 
            serverId 
          } 
        });

        toast({
          title: 'Success!',
          description: 'Your MCP server has been submitted to the registry.',
        });

        // Auto-advance after short delay
        setTimeout(() => {
          onSuccess();
        }, 2000);
      } else {
        throw new Error(result.error || 'Failed to submit to registry');
      }

    } catch (error) {
      console.error('Submission error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to submit to registry';
      
      setSubmissionState({ 
        step: 'error', 
        progress: 0, 
        message: errorMessage,
        error: errorMessage
      });

      toast({
        title: 'Submission failed',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const addCategory = () => {
    if (newCategory.trim() && !categories.includes(newCategory.trim())) {
      const updatedCategories = [...categories, newCategory.trim()];
      setCategories(updatedCategories);
      setNewCategory('');
    }
  };

  const removeCategory = (category: string) => {
    setCategories(categories.filter(c => c !== category));
  };

  if (submissionState.step === 'submitting') {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Submitting to Registry</h2>
          <p className="text-muted-foreground">
            Please wait while we submit your MCP server to the registry...
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>{submissionState.message}</span>
              <span>{submissionState.progress}%</span>
            </div>
            <Progress value={submissionState.progress} className="h-2" />
          </div>
        </div>
      </div>
    );
  }

  if (submissionState.step === 'success') {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold mb-2">Successfully Submitted!</h2>
          <p className="text-muted-foreground">
            Your MCP server has been successfully submitted to the registry.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Registry Server Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Label className="text-xs text-muted-foreground">Server ID</Label>
                <p className="font-mono">{submissionState.serverId}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Repository</Label>
                <p>{data.owner}/{data.repo}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="flex items-center gap-2"
                onClick={() => window.open(`https://registry.plugged.in/servers/${submissionState.serverId}`, '_blank')}
              >
                <Eye className="h-4 w-4" />
                View in Registry
                <ExternalLink className="h-3 w-3" />
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="flex items-center gap-2"
                onClick={() => {
                  // TODO: Implement import to profile functionality
                  toast({
                    title: 'Coming soon',
                    description: 'Direct import to profile will be available soon.',
                  });
                }}
              >
                <Upload className="h-4 w-4" />
                Add to Profile
              </Button>
            </div>
          </CardContent>
        </Card>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Next steps:</strong> Your server is now available in the registry. 
            Users can discover and install it directly from the registry. You can also 
            share the registry link with others or add it to your own profile.
          </AlertDescription>
        </Alert>
        
        {data.shouldClaim && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Claimed Server:</strong> This server has been claimed and is now linked to your GitHub account. 
              You can manage updates and analytics for this server.
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  if (submissionState.step === 'error') {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold mb-2">Submission Failed</h2>
          <p className="text-muted-foreground">
            There was an error submitting your server to the registry.
          </p>
        </div>

        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Error:</strong> {submissionState.error}
          </AlertDescription>
        </Alert>

        <div className="flex gap-2">
          <Button onClick={handleSubmit} className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Try Again
          </Button>
          <Button 
            variant="outline" 
            onClick={() => setSubmissionState({ step: 'review', progress: 0, message: '' })}
          >
            Back to Review
          </Button>
        </div>
      </div>
    );
  }

  // Review step
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Review & Submit</h2>
        <p className="text-muted-foreground">
          Review your configuration and submit your MCP server to the registry.
        </p>
      </div>

      {/* Repository Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            Repository Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <Label className="text-xs text-muted-foreground">Repository</Label>
              <p className="font-mono">{data.owner}/{data.repo}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Default Branch</Label>
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                <span>{data.repoInfo?.defaultBranch || 'main'}</span>
              </div>
            </div>
            {data.repoInfo?.language && (
              <div>
                <Label className="text-xs text-muted-foreground">Language</Label>
                <div className="flex items-center gap-2">
                  <Code className="h-4 w-4 text-muted-foreground" />
                  <span>{data.repoInfo.language}</span>
                </div>
              </div>
            )}
            <div>
              <Label className="text-xs text-muted-foreground">Status</Label>
              <div className="flex items-center gap-2">
                {data.shouldClaim ? (
                  <Badge variant="default">Claimed</Badge>
                ) : (
                  <Badge variant="secondary">Community</Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Package Information */}
      {data.transportConfigs && Object.keys(data.transportConfigs).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Package Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(data.transportConfigs).map(([key, config]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm">{config.packageName || key}</span>
                  <Badge variant="outline">{config.registry || 'npm'}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Environment Variables */}
      {data.detectedEnvVars && data.detectedEnvVars.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              Environment Variables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.detectedEnvVars.map((envVar, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <span className="font-mono">{envVar.name}</span>
                  <div className="flex items-center gap-2">
                    {envVar.required && <Badge variant="destructive" className="text-xs">Required</Badge>}
                    {envVar.isSecret && <Badge variant="secondary" className="text-xs">Secret</Badge>}
                    {data.configuredEnvVars?.[envVar.name] ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : envVar.required ? (
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    ) : (
                      <div className="h-4 w-4" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Custom Description */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Server Description
          </CardTitle>
          <CardDescription>
            Provide a description for your MCP server in the registry.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder={data.repoInfo?.description || "Enter a description for your MCP server..."}
              value={customDescription}
              onChange={(e) => setCustomDescription(e.target.value)}
              className="min-h-[100px]"
            />
            <p className="text-xs text-muted-foreground">
              {data.repoInfo?.description && !customDescription && 
                `Default: ${data.repoInfo.description}`
              }
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Categories */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Categories
          </CardTitle>
          <CardDescription>
            Add categories to help users discover your server.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Add a category..."
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addCategory()}
              />
              <Button onClick={addCategory} variant="outline">
                Add
              </Button>
            </div>
            
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <Badge key={category} variant="secondary" className="cursor-pointer" onClick={() => removeCategory(category)}>
                    {category} ×
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Submit Button */}
      <div className="flex justify-end">
        <Button 
          onClick={handleSubmit} 
          disabled={false}
          className="flex items-center gap-2"
        >
          <Upload className="h-4 w-4" />
          Submit to Registry
        </Button>
      </div>
    </div>
  );
}