import { redirect } from 'next/navigation';

import { getAuthSession } from '@/lib/auth';

import { DashboardClient } from './dashboard-client';

export default async function EmbeddedChatDashboard() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect('/login');
  }

  // Use client component to handle project selection
  return <DashboardClient />;
}