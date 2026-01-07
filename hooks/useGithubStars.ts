import { useEffect, useState } from 'react';

export function useGithubStars(repo: string) {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    // Validate repo format
    const repoPattern = /^[a-zA-Z0-9][a-zA-Z0-9\-_]{0,99}\/[a-zA-Z0-9][a-zA-Z0-9\-_]{0,99}$/;
    if (!repoPattern.test(repo)) {
      setStars(null);
      return;
    }

    const controller = new AbortController();

    // Use our API route instead of directly calling GitHub
    fetch(`/api/github/stars?repo=${encodeURIComponent(repo)}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error('API error');
        return res.json();
      })
      .then((data) => {
        if (typeof data.stars === 'number') {
          setStars(data.stars);
        }
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setStars(null);
        }
      });

    return () => {
      controller.abort();
    };
  }, [repo]);

  return stars;
}
