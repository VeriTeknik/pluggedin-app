# Dialog Component Patterns Analysis

## Files Analyzed

### Dialog Components Found:
1. `/components/ui/dialog.tsx` - Base UI dialog component
2. `/components/ui/alert-dialog.tsx` - Base UI alert dialog component
3. `/components/ui/confirm-dialog.tsx` - Reusable confirmation dialog
4. `/app/(sidebar-layout)/(container)/library/components/UploadDialog.tsx`
5. `/app/(sidebar-layout)/(container)/mcp-servers/components/share-collection-dialog.tsx`
6. `/app/collections/[uuid]/import-collection-dialog.tsx`
7. `/app/collections/components/import-collections-dialog.tsx`
8. `/components/server/share-server-dialog.tsx`
9. `/app/(sidebar-layout)/(container)/mcp-servers/components/server-dialogs.tsx`
10. `/app/(sidebar-layout)/(container)/search/components/ReviewsDialog.tsx`
11. `/app/(sidebar-layout)/(container)/search/components/ClaimServerDialog.tsx`
12. `/app/(sidebar-layout)/(container)/search/components/InstallDialog.tsx`
13. `/app/(sidebar-layout)/(container)/search/components/RateServerDialog.tsx`
14. `/components/server-detail-dialog.tsx`
15. `/app/(sidebar-layout)/(container)/mcp-servers/components/smart-server-dialog.tsx`
16. `/components/intelligent-server-dialog.tsx`
17. `/components/mcp/oauth-info-dialog.tsx`

## Common Patterns Identified

### 1. **Dialog Structure Pattern**
Most dialogs follow this structure:
```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
    </DialogHeader>
    {/* Main content */}
    <DialogFooter>
      <Button variant="outline" onClick={() => onOpenChange(false)}>
        Cancel
      </Button>
      <Button onClick={handleSubmit} disabled={isSubmitting}>
        {isSubmitting ? 'Processing...' : 'Submit'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 2. **State Management Pattern**
Common state variables across dialogs:
- `open: boolean` - Dialog visibility
- `onOpenChange: (open: boolean) => void` - Dialog state handler
- `isSubmitting: boolean` - Form submission state
- `isLoading: boolean` - Data loading state
- Form state (various implementations)
- Error state management

### 3. **Form Handling Pattern**
Two main approaches:
- **React Hook Form**: Used in `InstallDialog`, `RateServerDialog`
- **Manual State Management**: Used in most other dialogs

### 4. **API Call Pattern**
```tsx
const handleSubmit = async () => {
  setIsSubmitting(true);
  try {
    const result = await apiAction(params);
    if (result.success) {
      toast({ title: 'Success', description: '...' });
      onOpenChange(false);
      // Optional: onSuccess callback
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    toast({ 
      title: 'Error', 
      description: error.message,
      variant: 'destructive' 
    });
  } finally {
    setIsSubmitting(false);
  }
};
```

### 5. **Translation Pattern**
All dialogs use `useTranslation` hook:
```tsx
const { t } = useTranslation();
// or with namespace
const { t } = useTranslation(['namespace', 'common']);
```

### 6. **Loading States Pattern**
Different approaches:
- Skeleton loaders (ShareCollectionDialog)
- Loading text/spinners
- Disabled buttons during submission

### 7. **Validation Pattern**
- Client-side validation before API calls
- Toast notifications for validation errors
- Form field validation (react-hook-form)

## Repeated Code/Patterns That Could Be Abstracted

### 1. **Basic Dialog Wrapper**
A reusable dialog wrapper could handle:
- Open/close state
- Header with title and description
- Footer with cancel/submit buttons
- Loading/submitting states
- Translation integration

### 2. **Form Dialog Base**
A form-specific dialog could provide:
- Form state management (with option for react-hook-form)
- Submission handling with try/catch pattern
- Toast notifications
- Loading/error states
- Validation helpers

### 3. **API Dialog Pattern**
For dialogs that make API calls:
- Standard error handling
- Success/error toast patterns
- Loading states during API calls
- Refresh/callback after success

### 4. **Confirmation Dialog**
Already exists (`confirm-dialog.tsx`) but could be enhanced

### 5. **Multi-Step Dialog/Wizard**
Pattern seen in `share-server-dialog.tsx`:
- Step navigation
- Step indicators
- Back/Next buttons
- Step validation

## Specific Reusable Components That Could Be Created

### 1. **BaseDialog**
```tsx
interface BaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  isLoading?: boolean;
}
```

### 2. **FormDialog**
```tsx
interface FormDialogProps<T> extends BaseDialogProps {
  onSubmit: (data: T) => Promise<void>;
  submitText?: string;
  cancelText?: string;
  isSubmitting?: boolean;
  validationSchema?: any;
}
```

### 3. **ApiDialog**
```tsx
interface ApiDialogProps<TInput, TOutput> extends BaseDialogProps {
  apiCall: (data: TInput) => Promise<ApiResult<TOutput>>;
  onSuccess?: (result: TOutput) => void;
  successMessage?: string;
  errorMessage?: string;
}
```

### 4. **WizardDialog**
```tsx
interface WizardDialogProps extends BaseDialogProps {
  steps: WizardStep[];
  onComplete: (data: any) => Promise<void>;
  showStepIndicator?: boolean;
}
```

### 5. **useDialogState** Hook
```tsx
function useDialogState(initialOpen = false) {
  const [open, setOpen] = useState(initialOpen);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  return {
    open,
    setOpen,
    isSubmitting,
    setIsSubmitting,
    error,
    setError,
    // Helper methods
    handleOpen: () => setOpen(true),
    handleClose: () => setOpen(false),
    handleSubmit: async (fn: () => Promise<void>) => {
      setIsSubmitting(true);
      setError(null);
      try {
        await fn();
        setOpen(false);
      } catch (e) {
        setError(e.message);
      } finally {
        setIsSubmitting(false);
      }
    }
  };
}
```

### 6. **useApiDialog** Hook
```tsx
function useApiDialog<T, R>(apiCall: (data: T) => Promise<ApiResult<R>>) {
  const { toast } = useToast();
  const dialogState = useDialogState();
  
  const submit = async (data: T, options?: {
    successMessage?: string;
    onSuccess?: (result: R) => void;
  }) => {
    await dialogState.handleSubmit(async () => {
      const result = await apiCall(data);
      if (result.success) {
        toast({
          title: 'Success',
          description: options?.successMessage || 'Operation completed'
        });
        options?.onSuccess?.(result.data);
      } else {
        throw new Error(result.error);
      }
    });
  };
  
  return { ...dialogState, submit };
}
```

## Common Utilities Needed

1. **Toast Pattern Helper**
```tsx
const showSuccessToast = (message: string) => {
  toast({ title: t('common.success'), description: message });
};

const showErrorToast = (error: unknown) => {
  toast({ 
    title: t('common.error'), 
    description: error instanceof Error ? error.message : t('common.errors.unexpected'),
    variant: 'destructive'
  });
};
```

2. **Form Reset Helper**
```tsx
const useFormReset = (form: any, deps: any[]) => {
  useEffect(() => {
    if (open) {
      form.reset();
    }
  }, [open, ...deps]);
};
```

3. **Loading State Manager**
```tsx
const useLoadingStates = () => {
  const [states, setStates] = useState<Record<string, boolean>>({});
  
  const setLoading = (key: string, value: boolean) => {
    setStates(prev => ({ ...prev, [key]: value }));
  };
  
  const isLoading = (key: string) => states[key] || false;
  const isAnyLoading = () => Object.values(states).some(v => v);
  
  return { setLoading, isLoading, isAnyLoading };
};
```

## Implementation Priority

1. **High Priority** (Most reusable, immediate benefit):
   - BaseDialog component
   - useDialogState hook
   - Toast utility helpers

2. **Medium Priority** (Common patterns, good ROI):
   - FormDialog component
   - ApiDialog component
   - useApiDialog hook

3. **Low Priority** (Specific use cases):
   - WizardDialog component
   - Specialized dialog variants

## Migration Strategy

1. Start with new dialogs using the reusable components
2. Gradually refactor existing dialogs during maintenance
3. Create a dialog component guide/documentation
4. Add Storybook stories for dialog components