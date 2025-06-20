'use client';

import { Footer } from '@/components/footer';
import { LandingNavbar } from '@/components/landing-navbar';
import SidebarLayout from '@/components/sidebar-layout';
import { useAuth } from '@/hooks/use-auth';

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = useAuth();

  // For authenticated users, use the sidebar layout
  if (isAuthenticated) {
    return (
      <SidebarLayout>
        {children}
      </SidebarLayout>
    );
  }

  // For unauthenticated users, use the landing layout
  return (
    <div className="flex flex-col min-h-screen">
      <LandingNavbar />
      <main className="flex-grow">
        {children}
      </main>
      <Footer />
    </div>
  );
}