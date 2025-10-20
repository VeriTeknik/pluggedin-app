import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';

import { getProfiles, getProjectActiveProfile, updateProfile as updateProfileAction } from '@/app/actions/profiles';
import { getUUIDFromLocalStorage, removeFromLocalStorage, setUUIDInLocalStorage } from '@/lib/storage-utils';
import { Profile } from '@/types/profile';

import { useProjects } from './use-projects';

const CURRENT_PROFILE_KEY = 'pluggedin-current-profile';

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

    // Detect project change first
    const isProjectChange = currentProject.uuid !== lastProjectUuidRef.current;
    if (isProjectChange) {
      // Update ref FIRST before any state changes
      lastProjectUuidRef.current = currentProject.uuid;
      lastSetProfileUuidRef.current = null;
      // Don't clear profile state here - let it clear naturally when new profile loads
      // Don't proceed with profile selection until profiles are loaded
      return;
    }

    // Don't run profile selection until profiles are loaded and stable
    // This prevents the effect from running 355+ times while SWR is fetching
    if (profilesLoading || !profiles) {
      return;
    }

    // Only proceed if we have profiles or loading is complete
    const savedProfileUuid = getUUIDFromLocalStorage(CURRENT_PROFILE_KEY);
    if (profiles?.length) {
      let profileToSet: Profile | null = null;

      if (savedProfileUuid) {
        const savedProfile = profiles.find((p: Profile) => p.uuid === savedProfileUuid);
        if (savedProfile) {
          profileToSet = savedProfile;
        }
      }

      // If no saved profile or saved profile not found, use active profile or first profile
      // Use ref instead of dependency to avoid infinite loop
      if (!profileToSet) {
        profileToSet = activeProfileRef.current || profiles[0];
      }

      // Only update if profile actually changed
      if (profileToSet && profileToSet.uuid !== lastSetProfileUuidRef.current) {
        setCurrentProfile(profileToSet);
        lastSetProfileUuidRef.current = profileToSet.uuid;
      }
    }
  }, [profiles, currentProject, profilesLoading, activeProfile?.uuid]); // React when active profile changes

  // Persist profile selection
  const handleSetCurrentProfile = (profile: Profile | null) => {
    setCurrentProfile(profile);
    lastSetProfileUuidRef.current = profile?.uuid || null;

    if (profile) {
      setUUIDInLocalStorage(CURRENT_PROFILE_KEY, profile.uuid);
    } else {
      removeFromLocalStorage(CURRENT_PROFILE_KEY);
    }
  };

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
