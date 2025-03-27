'use client';

import { useEffect } from 'react';

import SidebarLayout from '@/components/sidebar-layout';
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

  return <SidebarLayout>{children}</SidebarLayout>;
}
