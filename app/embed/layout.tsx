import '@/app/globals.css';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Plugged.in Chat',
  description: 'Embedded chat powered by Plugged.in',
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