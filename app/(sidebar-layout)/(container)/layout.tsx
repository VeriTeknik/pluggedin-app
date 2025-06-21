'use client';

export default function ContainerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex-1 flex flex-col min-h-0 p-4">
      <div className="flex-1 flex flex-col min-h-0 bg-background space-y-4">
        {children}
      </div>
    </div>
  );
}
