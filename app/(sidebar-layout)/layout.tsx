'use client';

import { useEffect } from 'react';

import SidebarLayout from '@/components/sidebar-layout';
import { UploadProgressToast } from '@/components/upload-progress-toast';
import { UploadProgressProvider } from '@/contexts/UploadProgressContext';
import { initializeFont } from '@/lib/font-utils';

export default function LoggedInLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Initialize font from localStorage on component mount
  useEffect(() => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => {
        initializeFont();
      });
    } else {
      initializeFont();
    }
  }, []);

  return (
    <UploadProgressProvider>
      <SidebarLayout>{children}</SidebarLayout>
      <UploadProgressToast />
    </UploadProgressProvider>
  );
}
