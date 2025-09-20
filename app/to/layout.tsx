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
  title: 'User Profiles - Plugged.in Community',
  description: 'Discover and connect with developers, AI enthusiasts, and MCP server creators in the Plugged.in community. Share tools, collaborate on projects, and build together.',
}; 