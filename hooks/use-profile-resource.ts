import { useRef, useEffect } from 'react';
import useSWR from 'swr';

import { useProfiles } from './use-profiles';

export function useProfileResource<T>(
  resourceKey: string,
  fetcher: (profileUuid: string) => Promise<T>
) {
  const profileData = useProfiles();
  const currentProfile = profileData.currentProfile;
  const profileUuid = currentProfile?.uuid || null;
  const previousProfileUuidRef = useRef<string | null>(null);

  const { data, error, isLoading, mutate } = useSWR(
    profileUuid ? `${profileUuid}/${resourceKey}` : null,
    () => fetcher(profileUuid!),
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      onError: (err: Error) => {
        console.error(`Failed to load ${resourceKey}:`, err);
      }
    }
  );

  // Detect profile changes and force data refetch
  useEffect(() => {
    if (profileUuid && profileUuid !== previousProfileUuidRef.current) {
      previousProfileUuidRef.current = profileUuid;
      mutate();
    }
  }, [profileUuid, mutate]);

  return {
    data: data || undefined,
    error,
    isLoading,
    mutate,
    currentProfile
  };
}