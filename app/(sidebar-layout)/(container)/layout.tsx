'use client';

export default function ContainerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className='p-4'>{children}</div>;

}
