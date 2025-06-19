import { Metadata } from 'next';

import { Footer } from '@/components/footer';
import { LandingNavbar } from '@/components/landing-navbar';

export const metadata: Metadata = {
  title: 'Documentation - Plugged.in',
  description: 'Learn how to use Plugged.in, integrate MCP servers, and build AI-powered applications.',
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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