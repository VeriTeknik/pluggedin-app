'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

import { useThemeLogo } from '@/hooks/use-theme-logo';

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { logoSrc } = useThemeLogo();
  const [mounted, setMounted] = useState(false);

  // Ensure correct theme is applied after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2">
      <div className="hidden md:flex bg-muted items-center justify-center p-8">
        <div className="max-w-md">
          {mounted ? (
            <Image
              src={logoSrc}
              alt="Plugged.in Logo"
              width={200}
              height={100}
              className="mx-auto"
            />
          ) : (
            <div className="h-[100px] w-[200px] mx-auto" /> // Placeholder while not mounted
          )}
          
          <p className="text-center mt-2 text-muted-foreground">
            The AI crossroads.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="max-w-md w-full">
          <div className="md:hidden flex justify-center mb-8">
            {mounted ? (
              <Image
                src={logoSrc}
                alt="Plugged.in Logo"
                width={150}
                height={75}
              />
            ) : (
              <div className="h-[75px] w-[150px]" /> // Placeholder while not mounted
            )}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
} 