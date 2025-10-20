'use client';

import { useCallback, useEffect, useState } from 'react';

type Updater<T> = T | ((prev: T) => T);

/**
 * Minimal localStorage-backed state helper for client-side components.
 * Serialises values via JSON by default and removes the key when the value is
 * nullish to avoid stale entries.
 */
export function useLocalStorageState<T>(key: string, defaultValue: T) {
  const isBrowser = typeof window !== 'undefined';

  const readValue = () => {
    if (!isBrowser) {
      return defaultValue;
    }

    try {
      const storedValue = window.localStorage.getItem(key);
      if (storedValue === null) {
        return defaultValue;
      }
      try {
        return JSON.parse(storedValue) as T;
      } catch {
        return storedValue as unknown as T;
      }
    } catch (error) {
      console.warn(`Failed to read localStorage key "${key}":`, error);
      return defaultValue;
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
    if (!isBrowser) {
      return;
    }

    try {
      if (state === null || state === undefined) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, JSON.stringify(state));
      }
    } catch (error) {
      console.warn(`Failed to persist localStorage key "${key}":`, error);
    }
  }, [key, state, isBrowser]);

  return [state, setLocalStorageState] as const;
}
