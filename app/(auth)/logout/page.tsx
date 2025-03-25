'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    const performLogout = async () => {
      try {
        // Use signOut with explicit callback and clear all cookies
        await signOut({ 
          callbackUrl: '/',
          redirect: true 
        });
      } catch (error) {
        console.error('Logout error:', error);
        // Redirect to home even if there's an error
        router.push('/');
      }
    };

    performLogout();
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Signing Out...</h1>
        <p className="text-gray-500 mt-2">You are being logged out.</p>
      </div>
    </div>
  );
} 