'use client';

import { useCallback, useEffect, useState } from 'react';

import { safeLocalStorage } from '@/lib/storage-utils';

type Updater<T> = T | ((prev: T) => T);

/**
 * Minimal localStorage-backed state helper for client-side components.
 * Serialises values via JSON by default and removes the key when the value is
 * nullish to avoid stale entries.
 */
export function useLocalStorageState<T>(key: string, defaultValue: T) {
  const readValue = () => {
    const storedValue = safeLocalStorage.getItem(key);
    if (storedValue === null) {
      return defaultValue;
    }

    try {
      return JSON.parse(storedValue) as T;
    } catch {
      // Legacy values may have been stored unserialised
      return storedValue as unknown as T;
    }
  };

  const [state, setState] = useState<T>(readValue);

  const setLocalStorageState = useCallback(
    (value: Updater<T>) => {
      setState((prev) => (typeof value === 'function' ? (value as (prev: T) => T)(prev) : value));
    },
    []
  );

  useEffect(() => {
    if (state === null || state === undefined) {
      safeLocalStorage.removeItem(key);
    } else {
      safeLocalStorage.setJSON(key, state);
    }
  }, [key, state]);

  return [state, setLocalStorageState] as const;
}
