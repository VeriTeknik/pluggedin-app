import '@/app/globals.css';

import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Plugged.in Chat',
  description: 'Embedded chat powered by Plugged.in',
  robots: 'noindex, nofollow', // Prevent indexing of embed pages
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function EmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen overflow-hidden">
      {children}
    </div>
  );
}