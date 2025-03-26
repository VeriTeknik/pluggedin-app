'use client';

import { signOut } from 'next-auth/react';
import { useEffect } from 'react';

import { serverLogout } from '@/app/actions/auth';

export default function LogoutPage() {
  useEffect(() => {
    const performLogout = async () => {
      try {
        // First call our server action to delete sessions from database
        await serverLogout();
        
        // Then call our server-side API to clear cookies
        await fetch('/api/auth/logout', { 
          method: 'GET',
          credentials: 'include'
        });
        
        // Clear all cookies related to authentication
        document.cookie.split(';').forEach(cookie => {
          const [name] = cookie.trim().split('=');
          
          // Clear without domain (path only)
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;`;
          
          // Clear with exact domain
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=plugged.in;`;
          
          // Clear with domain with leading dot
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.plugged.in;`;
        });

        // Use signOut with redirect: false to manually handle redirects
        await signOut({ 
          callbackUrl: '/',
          redirect: false 
        });
        
        // Force a hard refresh to clear any client-side state
        window.location.href = '/';
      } catch (error) {
        console.error('Logout error:', error);
        // Force redirect to home even if there's an error
        window.location.href = '/';
      }
    };

    performLogout();
  }, []);

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Signing Out...</h1>
        <p className="text-gray-500 mt-2">You are being logged out.</p>
      </div>
    </div>
  );
} 