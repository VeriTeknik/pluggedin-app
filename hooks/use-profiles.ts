import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';

import { getProfiles, getProjectActiveProfile, updateProfile as updateProfileAction } from '@/app/actions/profiles';
import { getUUIDFromLocalStorage, removeFromLocalStorage, setUUIDInLocalStorage } from '@/lib/storage-utils';
import { Profile } from '@/types/profile';

import { useProjects } from './use-projects';

const PROFILE_STORAGE_KEY_PREFIX = 'pluggedin-current-profile';
const LEGACY_PROFILE_STORAGE_KEY = PROFILE_STORAGE_KEY_PREFIX;

const getProfileStorageKey = (projectUuid: string) =>
  `${PROFILE_STORAGE_KEY_PREFIX}-${projectUuid}`;

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

      const storageKey = getProfileStorageKey(currentProject.uuid);

      if (profile) {
        setUUIDInLocalStorage(storageKey, profile.uuid);
      } else {
        removeFromLocalStorage(storageKey);
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

    const storageKey = getProfileStorageKey(projectUuid);
    const savedProfileUuid = getUUIDFromLocalStorage(storageKey);

    let profileToSet: Profile | null = null;

    if (savedProfileUuid) {
      const savedProfile = profiles.find((p: Profile) => p.uuid === savedProfileUuid);
      if (savedProfile) {
        profileToSet = savedProfile;
      }
    }

    // Migrate from legacy storage key if present
    if (!profileToSet) {
      const legacyProfileUuid = getUUIDFromLocalStorage(LEGACY_PROFILE_STORAGE_KEY);
      if (legacyProfileUuid) {
        const legacyProfile = profiles.find((p: Profile) => p.uuid === legacyProfileUuid);
        if (legacyProfile) {
          profileToSet = legacyProfile;
          setUUIDInLocalStorage(storageKey, legacyProfile.uuid);
        }
        removeFromLocalStorage(LEGACY_PROFILE_STORAGE_KEY);
      }
    }

    // If no saved profile or saved profile not found, use active profile or first profile
    if (!profileToSet) {
      profileToSet = activeProfileRef.current || profiles[0];
    }

    // Only update if profile actually changed
    if (profileToSet && profileToSet.uuid !== lastSetProfileUuidRef.current) {
      handleSetCurrentProfile(profileToSet);
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
