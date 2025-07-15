import { useEffect, useState } from 'react';

export function useGithubStars(repo: string) {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    // Validate repo format (owner/repo)
    const repoPattern = /^[a-zA-Z0-9][a-zA-Z0-9\-_]{0,99}\/[a-zA-Z0-9][a-zA-Z0-9\-_]{0,99}$/;
    if (!repoPattern.test(repo)) {
      setStars(null);
      return;
    }
    
    const controller = new AbortController();
    fetch(`https://api.github.com/repos/${repo}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => setStars(data.stargazers_count))
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