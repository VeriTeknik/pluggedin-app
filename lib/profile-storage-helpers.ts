import { getUUIDFromLocalStorage, setUUIDInLocalStorage, removeFromLocalStorage } from '@/lib/storage-utils';

const LEGACY_KEY = 'pluggedin-current-profile';
const PREFIX = 'pluggedin-current-profile';

export function getStorageKey(projectUuid: string): string {
  return `${PREFIX}-${projectUuid}`;
}

export function loadProfileUuid(key: string): string | null {
  return getUUIDFromLocalStorage(key);
}

export function saveProfileUuid(key: string, uuid: string): void {
  setUUIDInLocalStorage(key, uuid);
}

export function removeProfileUuid(key: string): void {
  removeFromLocalStorage(key);
}

export function migrateLegacyProfileKey(newKey: string): string | null {
  const oldUuid = loadProfileUuid(LEGACY_KEY);
  if (!oldUuid) return null;

  saveProfileUuid(newKey, oldUuid);
  removeFromLocalStorage(LEGACY_KEY);
  return oldUuid;
}