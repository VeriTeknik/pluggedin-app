import { useEffect, useState } from 'react';

/**
 * Hook to handle component mounting state.
 * Used for preventing hydration mismatches and controlling mount-dependent effects.
 * 
 * @returns {boolean} Whether the component is mounted
 */
export function useMounted() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
} 