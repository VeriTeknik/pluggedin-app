'use client';

import SidebarLayout from '@/components/sidebar-layout';

export default function LoggedInLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <SidebarLayout>{children}</SidebarLayout>;
}
