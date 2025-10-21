interface WorkspaceLoaderProps {
  isLoading?: boolean;
  hasError?: boolean;
  errorMessage?: string;
  loadingMessage?: string;
}

export function WorkspaceLoader({
  isLoading,
  hasError = false,
  errorMessage = "No workspace available",
  loadingMessage = "Loading workspace..."
}: WorkspaceLoaderProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">{loadingMessage}</p>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">{errorMessage}</p>
          <p className="text-sm text-muted-foreground">Please create a workspace in this hub to continue.</p>
        </div>
      </div>
    );
  }

  return null;
}