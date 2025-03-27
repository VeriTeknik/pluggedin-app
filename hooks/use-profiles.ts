import { useEffect, useState } from 'react';
import useSWR from 'swr';

import { getProfiles, getProjectActiveProfile, updateProfile as updateProfileAction } from '@/app/actions/profiles';
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

  // Load saved profile on mount if authenticated
  useEffect(() => {
    if (!currentProject) {
      setCurrentProfile(null);
      return;
    }

    const savedProfileUuid = localStorage.getItem(CURRENT_PROFILE_KEY);
    if (profiles?.length) {
      if (savedProfileUuid) {
        const savedProfile = profiles.find((p) => p.uuid === savedProfileUuid);
        if (savedProfile) {
          setCurrentProfile(savedProfile);
          return;
        }
      }
      // If no saved profile or saved profile not found, use active profile or first profile
      setCurrentProfile(activeProfile || profiles[0]);
    }
  }, [profiles, activeProfile, currentProject]);

  // Persist profile selection
  const handleSetCurrentProfile = (profile: Profile | null) => {
    setCurrentProfile(profile);

    if (profile) {
      localStorage.setItem(CURRENT_PROFILE_KEY, profile.uuid);
    } else {
      localStorage.removeItem(CURRENT_PROFILE_KEY);
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
  };
}
