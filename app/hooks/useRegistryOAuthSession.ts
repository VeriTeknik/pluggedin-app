'use client';

import { useEffect, useState } from 'react';

import { clearRegistryOAuthSession,getRegistryOAuthToken } from '@/app/actions/registry-oauth-session';
import { useToast } from '@/hooks/use-toast';

interface OAuthSession {
  isAuthenticated: boolean;
  githubUsername: string | null;
  isLoading: boolean;
}

export function useRegistryOAuthSession() {
  const [session, setSession] = useState<OAuthSession>({
    isAuthenticated: false,
    githubUsername: null,
    isLoading: true,
  });
  const { toast } = useToast();

  const checkSession = async () => {
    try {
      const result = await getRegistryOAuthToken();
      if (result.success) {
        setSession({
          isAuthenticated: true,
          githubUsername: result.githubUsername || null,
          isLoading: false,
        });
        return result;
      } else {
        setSession({
          isAuthenticated: false,
          githubUsername: null,
          isLoading: false,
        });
        return null;
      }
    } catch (error) {
      console.error('Error checking OAuth session:', error);
      setSession({
        isAuthenticated: false,
        githubUsername: null,
        isLoading: false,
      });
      return null;
    }
  };

  const clearSession = async () => {
    try {
      const result = await clearRegistryOAuthSession();
      if (result.success) {
        setSession({
          isAuthenticated: false,
          githubUsername: null,
          isLoading: false,
        });
        toast({
          title: 'Session cleared',
          description: 'OAuth session has been cleared',
        });
      }
    } catch (error) {
      console.error('Error clearing OAuth session:', error);
      toast({
        title: 'Error',
        description: 'Failed to clear OAuth session',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  return {
    ...session,
    checkSession,
    clearSession,
  };
}