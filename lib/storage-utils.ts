/**
 * Safe localStorage utilities with validation
 */

// UUID v4 regex pattern
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  try {
    const value = localStorage.getItem(key);

    if (!value) {
      return null;
    }

    // Validate UUID format to prevent injection attacks
    if (!isValidUUID(value)) {
      console.warn(`Invalid UUID found in localStorage for key "${key}": ${value}`);
      // Remove invalid value
      localStorage.removeItem(key);
      return null;
    }

    return value;
  } catch (error) {
    // localStorage might be unavailable (private browsing, quota exceeded)
    console.warn(`Failed to access localStorage for key "${key}":`, error);
    return null;
  }
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

  try {
    localStorage.setItem(key, uuid);
    return true;
  } catch (error) {
    // localStorage might be unavailable (private browsing, quota exceeded)
    console.warn(`Failed to set localStorage for key "${key}":`, error);
    return false;
  }
}

/**
 * Safely removes an item from localStorage
 *
 * @param key - localStorage key
 */
export function removeFromLocalStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn(`Failed to remove localStorage key "${key}":`, error);
  }
}

/**
 * Check if localStorage is available
 */
export function isLocalStorageAvailable(): boolean {
  try {
    const test = '__localStorage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}
