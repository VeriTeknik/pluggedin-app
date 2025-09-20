import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { db } from '@/db';
import { users } from '@/db/schema';
import { getAdminEmails } from '@/lib/admin-notifications';
import { getAuthSession } from '@/lib/auth';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAuthSession();

  if (!session?.user?.email || !session?.user?.id) {
    redirect('/login');
  }

  // Check database for admin status first
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  let isAdmin = user?.is_admin || false;

  // Fallback to environment variable check for backward compatibility
  if (!isAdmin) {
    const adminEmails = getAdminEmails();
    isAdmin = adminEmails.includes(session.user.email);
  }

  if (!isAdmin) {
    // Redirect non-admin users to home page
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="flex h-16 items-center px-4">
          <h1 className="text-xl font-semibold">Admin Dashboard</h1>
          <nav className="ml-6 flex items-center space-x-4 lg:space-x-6">
            <a
              href="/admin/emails"
              className="text-sm font-medium transition-colors hover:text-primary"
            >
              Email Management
            </a>
            <a
              href="/admin/emails/compose"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              Compose
            </a>
            <a
              href="/admin/emails/templates"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              Templates
            </a>
            <a
              href="/admin/emails/history"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              History
            </a>
          </nav>
        </div>
      </div>
      <main className="flex-1 space-y-4 p-8 pt-6">{children}</main>
    </div>
  );
}