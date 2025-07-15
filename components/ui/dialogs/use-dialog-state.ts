import { useCallback,useState } from 'react';

export interface DialogState {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  handleOpen: () => void;
  handleClose: () => void;
  toggle: () => void;
}

export function useDialogState(initialOpen = false): DialogState {
  const [open, setOpen] = useState(initialOpen);

  const onOpenChange = useCallback((newOpen: boolean) => {
    setOpen(newOpen);
  }, []);

  const handleOpen = useCallback(() => {
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setOpen(prev => !prev);
  }, []);

  return {
    open,
    onOpenChange,
    handleOpen,
    handleClose,
    toggle,
  };
}