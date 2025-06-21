import { Metadata } from 'next';

import NotificationsSystemPageClient from './page-client';

export const metadata: Metadata = {
  title: 'Sending Notifications from AI - Plugged.in Tutorial',
  description: 'Set up automated notifications from your AI assistant. Learn to use pluggedin_send_notification for alerts and updates.',
};

export default function NotificationsSystemPage() {
  return <NotificationsSystemPageClient />;
}