'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

import { useThemeLogo } from '@/hooks/use-theme-logo';

export default function CliLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { logoSrc } = useThemeLogo();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-8">
      <div className="mb-8">
        {mounted ? (
          <Image
            src={logoSrc}
            alt="Plugged.in Logo"
            width={160}
            height={80}
            className="mx-auto"
          />
        ) : (
          <div style={{ width: '160px', height: '80px' }} className="mx-auto" />
        )}
      </div>
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  );
}
