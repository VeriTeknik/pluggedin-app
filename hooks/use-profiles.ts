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

  // Load saved profile on mount if authenticated
  useEffect(() => {
    if (!currentProject) {
      if (lastSetProfileUuidRef.current !== null) {
        setCurrentProfile(null);
        lastSetProfileUuidRef.current = null;
        lastProjectUuidRef.current = null;
      }
      return;
    }

    const projectUuid = currentProject.uuid;

    // Detect project change first
    const isProjectChange = projectUuid !== lastProjectUuidRef.current;
    if (isProjectChange) {
      // Update ref FIRST before any state changes
      lastProjectUuidRef.current = projectUuid;
      lastSetProfileUuidRef.current = null;
      // Clear local profile state so dependent views refetch with the new Hub
      setCurrentProfile(null);
      // Don't return early - allow profile selection logic to run for new project
    }

    // Don't run profile selection until profiles are loaded and stable
    if (profilesLoading || !profiles) {
      return;
    }

    if (!profiles.length) {
      // No profiles available for this Hub, ensure we clear any previous selection
      handleSetCurrentProfile(null);
      return;
    }

    // If we have profiles but no currentProfile is set, force selection of first profile
    if (profiles.length > 0 && !currentProfile) {
      const profileToSet = activeProfileRef.current || profiles[0];
      if (profileToSet && profileToSet.uuid !== lastSetProfileUuidRef.current) {
        handleSetCurrentProfile(profileToSet);
      }
      return;
    }

    const storageKey = getStorageKey(projectUuid);

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
      handleSetCurrentProfile(candidate);
    }
  }, [
    activeProfile?.uuid,
    currentProject,
    handleSetCurrentProfile,
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
