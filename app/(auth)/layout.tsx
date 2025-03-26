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

  // Define logo dimensions to keep Image and placeholder in sync
  const desktopLogoWidth = 200;
  const desktopLogoHeight = 100;
  const mobileLogoWidth = 150;
  const mobileLogoHeight = 75;

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
              width={desktopLogoWidth}
              height={desktopLogoHeight}
              className="mx-auto"
            />
          ) : (
            <div 
              style={{ 
                width: `${desktopLogoWidth}px`, 
                height: `${desktopLogoHeight}px` 
              }} 
              className="mx-auto" 
            /> // Placeholder while not mounted
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
                width={mobileLogoWidth}
                height={mobileLogoHeight}
                className="mx-auto"
              />
            ) : (
              <div 
                style={{ 
                  width: `${mobileLogoWidth}px`, 
                  height: `${mobileLogoHeight}px` 
                }} 
                className="mx-auto" 
              /> // Placeholder while not mounted
            )}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
} 