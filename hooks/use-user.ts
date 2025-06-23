import { useSession } from 'next-auth/react';
import useSWR from 'swr';

// Define a custom error type
class FetchError extends Error {
  info?: any;
  status?: number;
}

export function useUser() {
  const { data: session } = useSession();

  const swrKey = session?.user?.id ? `/api/users/${session.user.id}` : null;

  // Define a simple fetcher function
  const fetcher = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) {
      // Use the custom FetchError
      const error = new FetchError('An error occurred while fetching the data.');
      try {
        error.info = await res.json(); // Assign info
      } catch (e) {
        // Ignore if response is not JSON
      }
      error.status = res.status; // Assign status
      throw error;
    }
    return res.json();
  };

  // Pass the fetcher function to useSWR
  const { data: user, error, mutate } = useSWR(swrKey, fetcher);

  return {
    user,
    isLoading: !error && !user,
    isError: error,
    mutate,
  };
}
