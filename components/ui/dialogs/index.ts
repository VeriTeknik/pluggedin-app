export { BaseDialog, type BaseDialogProps } from './base-dialog';
export { FormDialog, type FormDialogProps } from './form-dialog';
export { WizardDialog, type WizardDialogProps, type WizardStep } from './wizard-dialog';

// Re-export commonly used dialog hooks
export { useDialogState } from './use-dialog-state';
export { useFormDialog } from './use-form-dialog';