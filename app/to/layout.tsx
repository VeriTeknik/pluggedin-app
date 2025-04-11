export default function ToLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      {children}
    </div>
  );
}

export const metadata = {
  title: 'Profiles - Plugged.in',
  description: 'Discover and connect with other Plugged.in users',
}; 