import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Reload the module under test so its per-area "warn once" state is fresh.
 */
async function loadStorageUtils() {
  vi.resetModules();
  return import('@/lib/storage-utils');
}

/**
 * Replaces window.localStorage / window.sessionStorage with a definition whose
 * getter throws, mirroring Safari with "Block All Cookies" / Lockdown Mode,
 * where even reading the property raises SecurityError.
 */
function makeStorageAccessThrow(kind: 'localStorage' | 'sessionStorage') {
  Object.defineProperty(window, kind, {
    configurable: true,
    get() {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    },
  });
}

function installStorage(kind: 'localStorage' | 'sessionStorage', storage: unknown) {
  Object.defineProperty(window, kind, {
    configurable: true,
    writable: true,
    value: storage,
  });
}

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => map.delete(key) as unknown as void,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  } as Storage;
}

const originalLocal = Object.getOwnPropertyDescriptor(window, 'localStorage');
const originalSession = Object.getOwnPropertyDescriptor(window, 'sessionStorage');

describe('safeLocalStorage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalLocal) {
      Object.defineProperty(window, 'localStorage', originalLocal);
    }
    if (originalSession) {
      Object.defineProperty(window, 'sessionStorage', originalSession);
    }
    vi.restoreAllMocks();
  });

  it('reads and writes when storage works', async () => {
    installStorage('localStorage', createMemoryStorage());
    const { safeLocalStorage } = await loadStorageUtils();

    expect(safeLocalStorage.setItem('key', 'value')).toBe(true);
    expect(safeLocalStorage.getItem('key')).toBe('value');
    expect(safeLocalStorage.removeItem('key')).toBe(true);
    expect(safeLocalStorage.getItem('key')).toBeNull();
    expect(safeLocalStorage.isAvailable()).toBe(true);
  });

  it('does not throw when accessing window.localStorage itself throws', async () => {
    makeStorageAccessThrow('localStorage');
    const { safeLocalStorage } = await loadStorageUtils();

    expect(() => safeLocalStorage.getItem('key')).not.toThrow();
    expect(safeLocalStorage.getItem('key')).toBeNull();
    expect(safeLocalStorage.setItem('key', 'value')).toBe(false);
    expect(safeLocalStorage.removeItem('key')).toBe(false);
    expect(safeLocalStorage.clear()).toBe(false);
    expect(safeLocalStorage.isAvailable()).toBe(false);
    expect(safeLocalStorage.getJSON('key', { fallback: true })).toEqual({ fallback: true });
    expect(safeLocalStorage.setJSON('key', { a: 1 })).toBe(false);
  });

  it('does not throw when storage methods throw SecurityError', async () => {
    const throwing = {
      getItem: () => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
      removeItem: () => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
      clear: () => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
      key: () => null,
      length: 0,
    };
    installStorage('localStorage', throwing);
    const { safeLocalStorage } = await loadStorageUtils();

    expect(safeLocalStorage.getItem('key')).toBeNull();
    expect(safeLocalStorage.setItem('key', 'value')).toBe(false);
    expect(safeLocalStorage.removeItem('key')).toBe(false);
    expect(safeLocalStorage.clear()).toBe(false);
  });

  it('warns at most once per storage area', async () => {
    makeStorageAccessThrow('localStorage');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { safeLocalStorage } = await loadStorageUtils();

    safeLocalStorage.getItem('a');
    safeLocalStorage.getItem('b');
    safeLocalStorage.setItem('c', 'd');

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('falls back when the stored JSON is malformed', async () => {
    const storage = createMemoryStorage();
    storage.setItem('key', '{not json');
    installStorage('localStorage', storage);
    const { safeLocalStorage } = await loadStorageUtils();

    expect(safeLocalStorage.getJSON('key', 'fallback')).toBe('fallback');
  });

  it('round-trips JSON values', async () => {
    installStorage('localStorage', createMemoryStorage());
    const { safeLocalStorage } = await loadStorageUtils();

    expect(safeLocalStorage.setJSON('key', { a: 1, b: [2, 3] })).toBe(true);
    expect(safeLocalStorage.getJSON('key', null)).toEqual({ a: 1, b: [2, 3] });
  });

  it('reports write failure when the quota is exceeded', async () => {
    const storage = createMemoryStorage();
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    installStorage('localStorage', storage);
    const { safeLocalStorage } = await loadStorageUtils();

    expect(safeLocalStorage.setItem('key', 'value')).toBe(false);
  });
});

describe('safeSessionStorage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalSession) {
      Object.defineProperty(window, 'sessionStorage', originalSession);
    }
    vi.restoreAllMocks();
  });

  it('does not throw when sessionStorage is blocked', async () => {
    makeStorageAccessThrow('sessionStorage');
    const { safeSessionStorage } = await loadStorageUtils();

    expect(() => safeSessionStorage.clear()).not.toThrow();
    expect(safeSessionStorage.clear()).toBe(false);
    expect(safeSessionStorage.getItem('key')).toBeNull();
  });
});

describe('UUID helpers with blocked storage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalLocal) {
      Object.defineProperty(window, 'localStorage', originalLocal);
    }
    vi.restoreAllMocks();
  });

  it('returns null / false instead of throwing', async () => {
    makeStorageAccessThrow('localStorage');
    const { getUUIDFromLocalStorage, setUUIDInLocalStorage, removeFromLocalStorage, isLocalStorageAvailable } =
      await loadStorageUtils();

    const uuid = '3f1b9c2e-6a5d-4f8b-9c1e-2a7d5b3e4f60';
    expect(getUUIDFromLocalStorage('key')).toBeNull();
    expect(setUUIDInLocalStorage('key', uuid)).toBe(false);
    expect(() => removeFromLocalStorage('key')).not.toThrow();
    expect(isLocalStorageAvailable()).toBe(false);
  });

  it('rejects invalid UUIDs and clears them', async () => {
    const storage = createMemoryStorage();
    storage.setItem('key', 'not-a-uuid');
    installStorage('localStorage', storage);
    const { getUUIDFromLocalStorage, setUUIDInLocalStorage } = await loadStorageUtils();

    expect(getUUIDFromLocalStorage('key')).toBeNull();
    expect(storage.getItem('key')).toBeNull();
    expect(setUUIDInLocalStorage('key', 'not-a-uuid')).toBe(false);
  });

  it('returns a valid stored UUID', async () => {
    const uuid = '3f1b9c2e-6a5d-4f8b-9c1e-2a7d5b3e4f60';
    const storage = createMemoryStorage();
    installStorage('localStorage', storage);
    const { getUUIDFromLocalStorage, setUUIDInLocalStorage } = await loadStorageUtils();

    expect(setUUIDInLocalStorage('key', uuid)).toBe(true);
    expect(getUUIDFromLocalStorage('key')).toBe(uuid);
  });
});
