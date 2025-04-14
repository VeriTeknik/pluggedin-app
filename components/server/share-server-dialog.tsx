'use client';

import { AlertCircle, Check, ChevronLeft, ChevronRight, Info, Share2 } from 'lucide-react'; // Sorted, removed Eye
import Link from 'next/link'; // Added for settings link
import { useRouter } from 'next/navigation'; // Sorted
import { useEffect, useState } from 'react'; // Sorted

import { createShareableTemplate } from '@/app/actions/mcp-servers'; // Sorted
import { isServerShared, shareMcpServer } from '@/app/actions/social'; // Removed unused unshareServer
import { Badge } from '@/components/ui/badge'; // Sorted
import { Button } from '@/components/ui/button'; // Sorted
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader, // Removed DialogFooter
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'; // Sorted
import { Input } from '@/components/ui/input'; // Sorted
import { Label } from '@/components/ui/label'; // Sorted
import { Separator } from '@/components/ui/separator'; // Sorted
import { Switch } from '@/components/ui/switch'; // Sorted
import { Textarea } from '@/components/ui/textarea'; // Sorted
import { useToast } from '@/components/ui/use-toast'; // Sorted
import { useUser } from '@/hooks/use-user'; // Added for user context
import { McpServer } from '@/types/mcp-server'; // Sorted


// Define steps for the wizard
enum ShareWizardStep {
  DETAILS,
  COMMAND_ARGS_ENV,
  CUSTOM_INSTRUCTIONS,
  REVIEW
}

interface ShareServerDialogProps {
  server: McpServer;
  profileUuid: string;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  children?: React.ReactNode;
  onShareStatusChange?: (isShared: boolean, sharedUuid: string | null) => void;
}

export function ShareServerDialog({
  server,
  profileUuid,
  variant = 'default',
  size = 'sm',
  children,
  onShareStatusChange,
}: ShareServerDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useUser(); // Get user context
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(server.name);
  const [description, setDescription] = useState(server.description || '');
  const [isPublic, setIsPublic] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isShared, setIsShared] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [sharedUuid, setSharedUuid] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [serverData, setServerData] = useState<any>(null);

  // Wizard state
  const [currentStep, setCurrentStep] = useState<ShareWizardStep>(ShareWizardStep.DETAILS);

  // Check if the server is already shared when component mounts
  useEffect(() => {
    async function checkIfShared() {
      if (!profileUuid || !server.uuid) {
         setIsChecking(false);
         // Reset state if profile/server info is missing
         setTitle(server.name);
         setDescription(server.description || '');
         setIsPublic(true);
         setSharedUuid(null);
         setIsShared(false);
         return;
      }
      try {
        setIsChecking(true);
        const result = await isServerShared(profileUuid, server.uuid);
        setIsShared(result.isShared);
        if (result.isShared && result.server) {
          setTitle(result.server.title);
          setDescription(result.server.description || '');
          setIsPublic(result.server.is_public);
          setSharedUuid(result.server.uuid);
        } else {
          // Reset if not shared or data missing
          setTitle(server.name);
          setDescription(server.description || '');
          setIsPublic(true);
          setSharedUuid(null);
        }
      } catch (error) {
        console.error('Error checking if server is shared:', error);
        // Reset on error
        setTitle(server.name);
        setDescription(server.description || '');
        setIsPublic(true);
        setSharedUuid(null);
        setIsShared(false);
      } finally {
        setIsChecking(false);
      }
    }

    if (open) { // Only check when dialog opens
       checkIfShared();
    } else {
       // Reset state when dialog closes
       setTitle(server.name);
       setDescription(server.description || '');
       setIsPublic(true);
       setSharedUuid(null);
       setIsShared(false); // Ensure isShared is reset
       setCurrentStep(ShareWizardStep.DETAILS);
       setServerData(null);
    }
  }, [profileUuid, server.uuid, server.name, server.description, open]); // Added dependencies

  // Load template data when dialog opens and isShared status is known
  useEffect(() => {
    async function loadTemplateData() {
      if (!open || isChecking) return; // Don't load if closed or still checking status

      setIsLoadingPreview(true);
      try {
        // Always generate a fresh template when opening the dialog
        const templateData = await createShareableTemplate(server);
        setServerData(templateData);
      } catch (error) {
        console.error("Error loading template data:", error);
        toast({
          title: 'Error',
          description: 'Failed to load server data. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingPreview(false);
      }
    }

    loadTemplateData();
  }, [open, server, toast, isChecking]); // Removed isShared, sharedUuid dependencies as we always generate fresh

  // Reset wizard step when dialog closes
  useEffect(() => {
    if (!open) {
      setCurrentStep(ShareWizardStep.DETAILS);
      setServerData(null);
    }
  }, [open]);


  const handleEditValue = (path: string[], value: string) => {
    if (!serverData) return;

    // Deep clone to avoid mutating state directly
    const updatedData = JSON.parse(JSON.stringify(serverData));

    // Navigate to the correct property using the path array
    let current = updatedData;
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }

    // Update the value
    current[path[path.length - 1]] = value;
    setServerData(updatedData);
  };

  const handleRedactValue = (path: string[]) => {
    handleEditValue(path, '<REDACTED>');
  };

  const handleExcludeCustomInstructions = () => {
    if (!serverData) return;

    const updatedData = JSON.parse(JSON.stringify(serverData));
    delete updatedData.customInstructions;
    setServerData(updatedData);
  };

  const handleNextStep = () => {
    setCurrentStep(currentStep + 1);
  };

  const handlePrevStep = () => {
    setCurrentStep(currentStep - 1);
  };

  const handleShare = async () => {
    if (!title.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide a title for the shared server',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Use the potentially edited serverData for sharing/updating
      const result = await shareMcpServer(
        profileUuid,
        server.uuid,
        title,
        description,
        isPublic,
        serverData // Pass the potentially edited data
      );

      if (result.success) {
        toast({
          title: 'Success',
          description: `Server ${isShared ? 'updated' : 'shared'} successfully`, // Dynamic message
        });
        const newSharedUuid = result.sharedServer?.uuid || null;
        setIsShared(true); // Ensure state reflects shared status
        setSharedUuid(newSharedUuid);
        onShareStatusChange?.(true, newSharedUuid);
        setOpen(false);
        router.refresh(); // Keep the router refresh for other components that might need it
      } else {
        throw new Error(result.error || `Failed to ${isShared ? 'update' : 'share'} server`);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // handleUnshare function removed

  // Render details step (title, description, visibility)
  const renderDetailsStep = () => (
    <div className="grid gap-4 py-2">
      <div className="grid gap-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title for the shared server"
          autoFocus
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          rows={3}
        />
      </div>
      <div className="flex items-center justify-between space-x-2">
        <Label htmlFor="isPublic" className="text-sm font-medium">
          Make public
        </Label>
        <Switch
          id="isPublic"
          checked={isPublic}
          onCheckedChange={setIsPublic}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {isPublic
          ? 'Anyone who visits your profile will be able to see this server'
          : 'Only you will be able to see this server on your profile'}
      </p>

      <div className="bg-amber-50 dark:bg-amber-950 p-3 rounded-md mt-2 space-y-2">
        <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
          Security Information
        </p>
        <p className="text-xs text-amber-800 dark:text-amber-300">
          When sharing, we automatically protect your sensitive data:
        </p>
        <ul className="text-xs text-amber-800 dark:text-amber-300 list-disc pl-4 space-y-1">
          <li>Passwords in connection strings are replaced with placeholders</li>
          <li>Sensitive environment variables are protected</li>
          <li>API keys and tokens are removed</li>
          <li>Custom instructions are included as-is (if configured)</li>
        </ul>
      </div>
    </div>
  );

  // Render command, arguments, and environment variables step
  const renderCommandArgsEnvStep = () => (
    <div className="space-y-6 py-2">
      {isLoadingPreview ? (
        <div className="flex justify-center items-center py-10">
          <p>Loading server data...</p>
        </div>
      ) : serverData ? (
        <>
          <div className="bg-amber-50 dark:bg-amber-950 p-3 rounded-md">
            <div className="flex items-start space-x-2">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="text-xs text-amber-800 dark:text-amber-300">
                <p className="font-medium">Important:</p>
                <p>
                  Review and edit the information below. You can redact any sensitive
                  data before sharing.
                </p>
              </div>
            </div>
          </div>

          {/* Command */}
          <div className="space-y-2">
            <Label className="text-base font-medium">Command</Label>
            {serverData.command ? (
              <div className="flex items-center gap-2">
                <Input
                  value={serverData.command}
                  onChange={(e) => handleEditValue(['command'], e.target.value)}
                  className="font-mono text-sm"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRedactValue(['command'])}
                >
                  Redact
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No command specified</p>
            )}
          </div>

          {/* Arguments */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Arguments</Label>
            {serverData.args && serverData.args.length > 0 ? (
              <div className="space-y-2">
                {serverData.args.map((arg: string, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={arg}
                      onChange={(e) => handleEditValue(['args', i.toString()], e.target.value)}
                      className="font-mono text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRedactValue(['args', i.toString()])}
                    >
                      Redact
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No arguments specified</p>
            )}
          </div>

          {/* Environment Variables */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Environment Variables</Label>
            {serverData.env && Object.keys(serverData.env).length > 0 ? (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {Object.entries(serverData.env).map(([key, value]: [string, any]) => (
                  <div key={key} className="grid grid-cols-[1fr,2fr,auto] gap-2 items-center">
                    <div className="font-mono text-sm">{key}</div>
                    <Input
                      value={value as string}
                      onChange={(e) => handleEditValue(['env', key], e.target.value)}
                      className="font-mono text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRedactValue(['env', key])}
                    >
                      Redact
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No environment variables</p>
            )}
          </div>

          {/* URL */}
          {serverData.url && (
            <div className="space-y-2">
              <Label className="text-base font-medium">URL</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={serverData.url}
                  onChange={(e) => handleEditValue(['url'], e.target.value)}
                  className="font-mono text-sm"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRedactValue(['url'])}
                >
                  Redact
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex justify-center items-center py-10">
          <p>Failed to load server data</p>
        </div>
      )}
    </div>
  );

  // Render custom instructions step
  const renderCustomInstructionsStep = () => (
    <div className="space-y-6 py-2">
      {isLoadingPreview ? (
        <div className="flex justify-center items-center py-10">
          <p>Loading server data...</p>
        </div>
      ) : serverData && serverData.customInstructions ? (
        <>
          <div className="bg-green-50 dark:bg-green-950 p-3 rounded-md">
            <div className="flex items-start space-x-2">
              <Info className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
              <div className="text-xs text-green-800 dark:text-green-300">
                <p className="font-medium">Custom Instructions</p>
                <p>
                  These instructions will be shared as-is and visible to anyone who
                  imports this server. You can exclude them if needed.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-base font-medium">Custom Instructions Content</Label>
            <div className="bg-muted rounded-md p-4 max-h-[300px] overflow-y-auto">
              {serverData.customInstructions.map((message: any, i: number) => (
                <div key={i} className="mb-4">
                  {typeof message === 'string' ? (
                    <div className="text-sm whitespace-pre-wrap font-mono">{message}</div>
                  ) : (
                    <>
                      <div className="font-medium text-sm">{message.role || 'unknown'}:</div>
                      <div className="text-sm whitespace-pre-wrap font-mono ml-4 mt-1">
                        {typeof message.content === 'string'
                          ? message.content
                          : Array.isArray(message.content)
                          ? message.content.map((c: any, j: number) => (
                              <div key={j} className="ml-2">
                                {c && c.type === 'text' ? c.text : '[Non-text content]'}
                              </div>
                            ))
                          : message.content && typeof message.content === 'object' && message.content.type === 'text'
                          ? message.content.text
                          : '[Non-text content]'}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={handleExcludeCustomInstructions}
              className="w-full"
            >
              Exclude Custom Instructions
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col justify-center items-center gap-3 py-10">
          <p className="text-muted-foreground">No custom instructions configured for this server</p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextStep}
          >
            Skip this step
          </Button>
        </div>
      )}
    </div>
  );

  // Render review step
  const renderReviewStep = () => (
    <div className="space-y-6 py-2">
      <div className="bg-green-50 dark:bg-green-950 p-3 rounded-md">
        <div className="flex items-start space-x-2">
          <Info className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
          <div className="text-xs text-green-800 dark:text-green-300">
            <p className="font-medium">Ready to share!</p>
            <p>
              Review your sharing settings below and click &quot;Publish&quot; when ready.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium mb-1">Title</h3>
          <p className="text-base">{title}</p>
        </div>

        {description && (
          <div>
            <h3 className="text-sm font-medium mb-1">Description</h3>
            <p className="text-base">{description}</p>
          </div>
        )}

        <div>
          <h3 className="text-sm font-medium mb-1">Visibility</h3>
          <Badge variant={isPublic ? "default" : "outline"}>
            {isPublic ? "Public" : "Private"}
          </Badge>
        </div>

        <Separator />

        <div>
          <h3 className="text-sm font-medium mb-1">Shared Content</h3>
          <ul className="text-sm list-disc pl-5 space-y-1">
            <li>
              Command{" "}
              {serverData && serverData.command ? (
                <span className="text-green-600 dark:text-green-500">✓</span>
              ) : (
                <span className="text-muted-foreground">not specified</span>
              )}
            </li>
            <li>
              Arguments{" "}
              {serverData && serverData.args && serverData.args.length > 0 ? (
                <span className="text-green-600 dark:text-green-500">{serverData.args.length} defined</span>
              ) : (
                <span className="text-muted-foreground">none</span>
              )}
            </li>
            <li>
              Environment Variables{" "}
              {serverData && serverData.env ? (
                <span className="text-green-600 dark:text-green-500">{Object.keys(serverData.env).length} defined</span>
              ) : (
                <span className="text-muted-foreground">none</span>
              )}
            </li>
            <li>
              Custom Instructions{" "}
              {serverData && serverData.customInstructions ? (
                <span className="text-green-600 dark:text-green-500">included</span>
              ) : (
                <span className="text-muted-foreground">excluded</span>
              )}
            </li>
          </ul>
        </div>
      </div>
    </div>
  );

  const renderStep = () => {
    switch (currentStep) {
      case ShareWizardStep.DETAILS:
        return renderDetailsStep();
      case ShareWizardStep.COMMAND_ARGS_ENV:
        return renderCommandArgsEnvStep();
      case ShareWizardStep.CUSTOM_INSTRUCTIONS:
        return renderCustomInstructionsStep();
      case ShareWizardStep.REVIEW:
        return renderReviewStep();
      default:
        return renderDetailsStep();
    }
  };

  const renderStepIndicator = () => {
    const steps = ["Details", "Server Config", "Instructions", "Review"];

    return (
      <div className="flex justify-between items-center mb-6 px-1">
        {steps.map((step, index) => (
          <div key={index} className="flex flex-col items-center w-1/4">
            <div
              className={`rounded-full h-7 w-7 flex items-center justify-center mb-1 text-xs
                ${currentStep === index
                  ? "bg-primary text-primary-foreground"
                  : currentStep > index
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"}`}
            >
              {index + 1}
            </div>
            <span className={`text-xs ${currentStep === index ? "font-medium" : "text-muted-foreground"}`}>
              {step}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const renderNavButtons = () => {
    const isLastStep = currentStep === ShareWizardStep.REVIEW;
    const isFirstStep = currentStep === ShareWizardStep.DETAILS;

    const shouldSkipCustomInstructions =
      currentStep === ShareWizardStep.COMMAND_ARGS_ENV &&
      (!serverData || !serverData.customInstructions);

    const nextLabel = isLastStep ? (isShared ? "Update" : "Publish") : "Next";
    const nextAction = isLastStep ? handleShare : handleNextStep;

    // Determine the next step when clicking Next
    const getNextStep = () => {
      if (currentStep === ShareWizardStep.COMMAND_ARGS_ENV) {
        return shouldSkipCustomInstructions
          ? ShareWizardStep.REVIEW
          : ShareWizardStep.CUSTOM_INSTRUCTIONS;
      }
      return currentStep + 1;
    };

    const handleNextWithSkip = () => {
      setCurrentStep(getNextStep());
    };

    return (
      <div className={'flex justify-between items-center mt-6'}> {/* Use curly braces for className */}
        {/* Left Buttons (Back) */}
        <div className="flex gap-2">
          {!isFirstStep && (
            <Button
              type="button"
              variant="outline"
              onClick={handlePrevStep}
              className="flex items-center"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          )}
          {/* Unshare button removed from dialog */}
        </div>

        {/* Right Buttons (Cancel, Next/Publish/Update) */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={isLastStep ? nextAction : handleNextWithSkip}
            disabled={isSubmitting || isLoadingPreview}
            className="flex items-center"
          >
            {isSubmitting ? 'Processing...' : nextLabel}
            {!isLastStep && <ChevronRight className="h-4 w-4 ml-1" />}
          </Button>
        </div>
      </div>
    );
  };

  // Add username check dialog content
  const renderUsernamePrompt = () => (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Set Up Your Username First</DialogTitle>
        <DialogDescription>
          To share MCP servers, you need to set up your username. This will create your public profile where your shared servers will be displayed.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4 py-4">
        <div className="bg-amber-50 dark:bg-amber-950 p-3 rounded-md">
          <div className="flex items-start space-x-2">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="text-sm text-amber-800 dark:text-amber-300">
              Your username will be used to create your public profile URL:
              <br />
              <code className="text-xs">plugged.in/to/your-username</code>
            </div>
          </div>
        </div>
        <Button asChild>
          <Link href="/settings">
            Set Up Username
          </Link>
        </Button>
      </div>
    </DialogContent>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button
            variant={isShared ? "outline" : variant}
            size={size}
            className={isShared ? "text-green-600" : ""}
          >
            {isShared ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Shared
              </>
            ) : (
              <>
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </>
            )}
          </Button>
        )}
      </DialogTrigger>
      {/* Show username prompt if no username is set */}
      {!user?.username ? renderUsernamePrompt() : (
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {isShared ? 'Update Shared Server' : 'Share MCP Server'}
            </DialogTitle>
            <DialogDescription>
              {isShared
                ? 'Update or remove this shared server from your profile'
                : 'Share this MCP server on your public profile'}
            </DialogDescription>
          </DialogHeader>

          {renderStepIndicator()}
          {renderStep()}
          {renderNavButtons()}
        </DialogContent>
      )}
    </Dialog>
  );
}
