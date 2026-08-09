/**
 * Safe localStorage utilities with validation
 *
 * Browsers can make Web Storage completely unavailable: Safari in Lockdown /
 * "Block All Cookies" mode, iOS private browsing, and embedded webviews all
 * throw `SecurityError: The operation is insecure.` — not only from
 * `getItem`/`setItem`, but from merely *reading* the `window.localStorage`
 * property. Every access in the app must therefore go through the helpers
 * below so a hostile storage environment degrades to "no persistence" instead
 * of crashing the React tree.
 */

// UUID v4 regex pattern
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type StorageKind = 'localStorage' | 'sessionStorage';

// Warn at most once per storage area so a blocked browser does not flood the
// console (and Sentry breadcrumbs) on every read/write.
const warnedAreas = new Set<string>();

function warnOnce(area: string, error: unknown): void {
  if (warnedAreas.has(area)) {
    return;
  }
  warnedAreas.add(area);
  console.warn(`[storage] ${area} is unavailable, continuing without persistence:`, error);
}

/**
 * Resolves a storage area, returning null when it is unavailable.
 * Accessing `window.localStorage` itself throws in some browsers, so the
 * property read is inside the try block.
 */
function getStorage(kind: StorageKind): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window[kind] ?? null;
  } catch (error) {
    warnOnce(kind, error);
    return null;
  }
}

export interface SafeStorage {
  /** Reads a key, returning null when storage is unavailable or the key is missing. */
  getItem(key: string): string | null;
  /** Writes a key. Returns true when the value was persisted. */
  setItem(key: string, value: string): boolean;
  /** Removes a key. Returns true when the removal was persisted. */
  removeItem(key: string): boolean;
  /** Clears the storage area. Returns true when the clear was performed. */
  clear(): boolean;
  /** Reads and JSON-parses a key, falling back when unavailable or malformed. */
  getJSON<T>(key: string, fallback: T): T;
  /** JSON-serialises and writes a key. Returns true when the value was persisted. */
  setJSON(key: string, value: unknown): boolean;
  /** Whether the storage area can actually be written to. */
  isAvailable(): boolean;
}

function createSafeStorage(kind: StorageKind): SafeStorage {
  return {
    getItem(key) {
      const storage = getStorage(kind);
      if (!storage) {
        return null;
      }
      try {
        return storage.getItem(key);
      } catch (error) {
        warnOnce(kind, error);
        return null;
      }
    },

    setItem(key, value) {
      const storage = getStorage(kind);
      if (!storage) {
        return false;
      }
      try {
        storage.setItem(key, value);
        return true;
      } catch (error) {
        // Also covers QuotaExceededError when the storage area is full.
        warnOnce(kind, error);
        return false;
      }
    },

    removeItem(key) {
      const storage = getStorage(kind);
      if (!storage) {
        return false;
      }
      try {
        storage.removeItem(key);
        return true;
      } catch (error) {
        warnOnce(kind, error);
        return false;
      }
    },

    clear() {
      const storage = getStorage(kind);
      if (!storage) {
        return false;
      }
      try {
        storage.clear();
        return true;
      } catch (error) {
        warnOnce(kind, error);
        return false;
      }
    },

    getJSON<T>(key: string, fallback: T): T {
      const raw = this.getItem(key);
      if (raw === null) {
        return fallback;
      }
      try {
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    },

    setJSON(key, value) {
      let serialised: string;
      try {
        serialised = JSON.stringify(value);
      } catch (error) {
        console.warn(`[storage] Failed to serialise value for key "${key}":`, error);
        return false;
      }
      return this.setItem(key, serialised);
    },

    isAvailable() {
      const storage = getStorage(kind);
      if (!storage) {
        return false;
      }
      try {
        const probe = '__storage_test__';
        storage.setItem(probe, probe);
        storage.removeItem(probe);
        return true;
      } catch (error) {
        warnOnce(kind, error);
        return false;
      }
    },
  };
}

/** localStorage wrapper that never throws. */
export const safeLocalStorage: SafeStorage = createSafeStorage('localStorage');

/** sessionStorage wrapper that never throws. */
export const safeSessionStorage: SafeStorage = createSafeStorage('sessionStorage');

/**
 * Validates if a string is a valid UUID v4
 */
export function isValidUUID(uuid: string): boolean {
  return typeof uuid === 'string' && UUID_V4_REGEX.test(uuid);
}

/**
 * Safely gets a UUID from localStorage with validation
 *
 * @param key - localStorage key
 * @returns Valid UUID string or null if invalid/missing
 */
export function getUUIDFromLocalStorage(key: string): string | null {
  const value = safeLocalStorage.getItem(key);

  if (!value) {
    return null;
  }

  // Validate UUID format to prevent injection attacks
  if (!isValidUUID(value)) {
    console.warn(`Invalid UUID found in localStorage for key "${key}": ${value}`);
    // Remove invalid value
    safeLocalStorage.removeItem(key);
    return null;
  }

  return value;
}

/**
 * Safely sets a UUID in localStorage with validation
 *
 * @param key - localStorage key
 * @param uuid - UUID to store
 * @returns true if successful, false otherwise
 */
export function setUUIDInLocalStorage(key: string, uuid: string): boolean {
  // Validate UUID before storing
  if (!isValidUUID(uuid)) {
    console.error(`Attempted to store invalid UUID for key "${key}": ${uuid}`);
    return false;
  }

  return safeLocalStorage.setItem(key, uuid);
}

/**
 * Safely removes an item from localStorage
 *
 * @param key - localStorage key
 */
export function removeFromLocalStorage(key: string): void {
  safeLocalStorage.removeItem(key);
}

/**
 * Check if localStorage is available
 */
export function isLocalStorageAvailable(): boolean {
  return safeLocalStorage.isAvailable();
}
