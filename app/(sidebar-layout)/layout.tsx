'use client';

import { useEffect } from 'react';
import { initializeFont } from '@/lib/font-utils';
import SidebarLayout from '@/components/sidebar-layout';

export default function LoggedInLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Initialize font from localStorage on component mount
  useEffect(() => {
    initializeFont();
  }, []);

  return <SidebarLayout>{children}</SidebarLayout>;
}
