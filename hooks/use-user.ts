import { useSession } from 'next-auth/react';
import useSWR from 'swr';

export function useUser() {
  const { data: session } = useSession();
  const { data: user, error, mutate } = useSWR(
    session?.user?.id ? `/api/users/${session.user.id}` : null
  );

  return {
    user,
    isLoading: !error && !user,
    isError: error,
    mutate,
  };
} 