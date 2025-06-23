'use client';

import { PageContainer } from '@/components/ui/page-container';

export default function ContainerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <PageContainer className="p-4">
      <PageContainer className="bg-background space-y-4">
        {children}
      </PageContainer>
    </PageContainer>
  );
}
