import type { Metadata } from 'next';

import { TeamCollaborationPageClient } from './page-client';

export const metadata: Metadata = {
  title: 'Team Collaboration - Plugged.in Docs',
  description: 'Learn how to collaborate with your team using Plugged.in workspaces and profiles',
  keywords: ['team', 'collaboration', 'workspaces', 'profiles', 'sharing'],
};

export default function TeamCollaborationPage() {
  return <TeamCollaborationPageClient />;
}