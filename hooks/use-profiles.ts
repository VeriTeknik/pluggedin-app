import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';

import { getProfiles, getProjectActiveProfile, updateProfile as updateProfileAction } from '@/app/actions/profiles';
import {
  getStorageKey,
  loadProfileUuid,
  saveProfileUuid,
  removeProfileUuid,
  migrateLegacyProfileKey
} from '@/lib/profile-storage-helpers';
import { Profile } from '@/types/profile';

import { useProjects } from './use-projects';

const LEGACY_PROFILE_STORAGE_KEY = 'pluggedin-current-profile';

export function useProfiles() {
  const { currentProject } = useProjects();

  const {
    data: profiles = [],
    error: profilesError,
    isLoading: profilesLoading,
    mutate: mutateProfiles,
  } = useSWR(
    currentProject ? `${currentProject.uuid}/profiles` : null,
    () => getProfiles(currentProject?.uuid || ''),
    {
      onError: () => []
    }
  );

  const {
    data: activeProfile = null,
    isLoading: activeProfileLoading,
    error: activeProfileError,
    mutate: mutateActiveProfile,
  } = useSWR(
    currentProject ? `${currentProject.uuid}/profiles/current` : null,
    () => getProjectActiveProfile(currentProject?.uuid || ''),
    {
      onError: () => null
    }
  );

  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const lastSetProfileUuidRef = useRef<string | null>(null);
  const lastProjectUuidRef = useRef<string | null>(null);
  const activeProfileRef = useRef<Profile | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Track activeProfile in a ref to avoid dependency loops
  useEffect(() => {
    activeProfileRef.current = activeProfile;
  }, [activeProfile]);

  // Note: isCurrentUserAdmin should come from the user object, not profile
  // const isCurrentUserAdmin = currentProfile?.userIsAdmin ?? false;

  // Persist profile selection
  const handleSetCurrentProfile = useCallback(
    (profile: Profile | null) => {
      setCurrentProfile(profile);
      lastSetProfileUuidRef.current = profile?.uuid || null;

      if (!currentProject?.uuid) {
        return;
      }

      const storageKey = getStorageKey(currentProject.uuid);

      if (profile) {
        saveProfileUuid(storageKey, profile.uuid);
      } else {
        removeProfileUuid(storageKey);
      }
    },
    [currentProject?.uuid]
  );

  // Handle project reset and changes with cleanup
  useEffect(() => {
    // Cancel any pending requests from previous project
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    if (!currentProject) {
      lastProjectUuidRef.current = null;
      lastSetProfileUuidRef.current = null;
      setCurrentProfile(null);
      return;
    }

    if (currentProject.uuid !== lastProjectUuidRef.current) {
      lastProjectUuidRef.current = currentProject.uuid;
      lastSetProfileUuidRef.current = null;
      setCurrentProfile(null);
    }

    // Cleanup function to cancel requests
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [currentProject]);

  // Handle profile selection when profiles are loaded
  useEffect(() => {
    if (!currentProject || profilesLoading || !profiles) {
      return;
    }

    const storageKey = getStorageKey(currentProject.uuid);

    // 1. Try per-project saved UUID
    let profileUuid = loadProfileUuid(storageKey);

    // 2. Migrate legacy if none
    if (!profileUuid) {
      profileUuid = migrateLegacyProfileKey(storageKey);
    }

    // 3. Pick active or first
    const candidate =
      profiles.find((p: Profile) => p.uuid === profileUuid) ||
      activeProfileRef.current ||
      profiles[0];

    if (candidate?.uuid !== lastSetProfileUuidRef.current) {
      lastSetProfileUuidRef.current = candidate.uuid;
      setCurrentProfile(candidate);

      // Persist the selection if we have a current project
      if (currentProject?.uuid) {
        const storageKey = getStorageKey(currentProject.uuid);
        saveProfileUuid(storageKey, candidate.uuid);
      }
    }
  }, [
    currentProject?.uuid,
    profiles,
    profilesLoading,
  ]); // React when active profile changes

  const updateProfile = async (profile: Profile) => {
    const { uuid, ...data } = profile;
    const updatedProfile = await updateProfileAction(uuid, data);
    await mutateProfiles();
    await mutateActiveProfile();
    return updatedProfile;
  };

  return {
    profiles: profiles ?? [],
    currentProfile,
    setCurrentProfile: handleSetCurrentProfile,
    activeProfile,
    isLoading: profilesLoading || activeProfileLoading,
    error: profilesError || activeProfileError,
    mutateProfiles,
    mutateActiveProfile,
    updateProfile,
    // isCurrentUserAdmin removed - use session.user.is_admin instead
  };
}
