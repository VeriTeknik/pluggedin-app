import { useEffect } from 'react';

export function useKeyPress(
  targetKey: string,
  handler: (event: KeyboardEvent) => void,
  active = true
) {
  useEffect(() => {
    if (!active) {
      return;
    }

    const listener = (e: KeyboardEvent) => {
      if (e.key === targetKey) {
        handler(e);
      }
    };

    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [targetKey, handler, active]);
} 