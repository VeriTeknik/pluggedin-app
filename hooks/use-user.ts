import { useSession } from 'next-auth/react';
import useSWR from 'swr';

// Define a custom error type
class FetchError extends Error {
  info?: any;
  status?: number;
}

export function useUser() {
  const { data: session, status } = useSession(); // Also get status for logging

  // Log the session object received from useSession
  console.log('useUser Hook: Session data from useSession:', { session, status });

  const swrKey = session?.user?.id ? `/api/users/${session.user.id}` : null;
  console.log('useUser Hook: SWR Key:', swrKey); // Log the key being used for SWR

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

  // Log the result of the SWR fetch
  console.log('useUser Hook: SWR Result:', { user, error });

  return {
    user,
    isLoading: !error && !user,
    isError: error,
    mutate,
  };
}
