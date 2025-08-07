'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { getEmbeddedChat } from '@/app/actions/embedded-chat';
import { getActiveConversations,getDashboardMetrics, getRecentConversations } from '@/app/actions/embedded-chat-analytics';
import { useProjects } from '@/hooks/use-projects';

import { DashboardContent } from './components/dashboard-content';

export function DashboardClient() {
  const router = useRouter();
  const { currentProject, isLoading: projectsLoading } = useProjects();
  const [metrics, setMetrics] = useState<any>(null);
  const [recentConversations, setRecentConversations] = useState<any[]>([]);
  const [activeConversations, setActiveConversations] = useState<any[]>([]);
  const [chatName, setChatName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!projectsLoading && currentProject) {
      // If no AI assistant, redirect to setup
      if (!currentProject.embedded_chat_uuid) {
        router.push('/embedded-chat');
        return;
      }

      // If chat exists but not enabled, redirect to configuration
      if (!currentProject.embedded_chat_enabled) {
        router.push(`/embedded-chat/${currentProject.embedded_chat_uuid}`);
        return;
      }

      // Load dashboard data
      loadDashboardData(currentProject.embedded_chat_uuid);
    }
  }, [currentProject, projectsLoading, router]);

  const loadDashboardData = async (chatUuid: string) => {
    try {
      setIsLoading(true);
      const [chatResult, metricsResult, recentResult, activeResult] = await Promise.all([
        getEmbeddedChat(chatUuid),
        getDashboardMetrics(chatUuid),
        getRecentConversations(chatUuid),
        getActiveConversations(chatUuid),
      ]);

      if (chatResult.success && chatResult.data) {
        setChatName(chatResult.data.name);
      }

      setMetrics(metricsResult.data || {
        activeConversations: 0,
        todayConversations: 0,
        todayMessages: 0,
        avgResponseTime: 0,
        humanInterventions: 0,
        satisfactionScore: 0,
      });

      setRecentConversations(recentResult.data?.map((conv: any) => ({
        ...conv,
        visitor_name: conv.visitor_name || undefined,
        visitor_email: conv.visitor_email || undefined,
        ended_at: conv.ended_at || undefined,
        page_url: conv.page_url || undefined,
        status: conv.status || 'ended',
      })) || []);

      setActiveConversations(activeResult.data?.map((conv: any) => ({
        ...conv,
        visitor_name: conv.visitor_name || undefined,
        visitor_email: conv.visitor_email || undefined,
        ended_at: conv.ended_at || undefined,
        page_url: conv.page_url || undefined,
        status: conv.status || 'active',
      })) || []);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (projectsLoading || isLoading || !currentProject) {
    return (
      <div className="container mx-auto py-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">AI Assistant Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Monitor and manage your AI assistant
          </p>
        </div>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!currentProject.embedded_chat_uuid) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <div className="text-sm text-muted-foreground mb-2">
          Hub: <span className="font-medium">{currentProject.name}</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          {chatName || 'AI Assistant'} Dashboard
        </h1>
        <p className="text-muted-foreground mt-2">
          Monitor and manage your AI chat assistant
        </p>
      </div>

      <DashboardContent
        chatUuid={currentProject.embedded_chat_uuid}
        metrics={metrics}
        recentConversations={recentConversations}
        activeConversations={activeConversations}
      />
    </div>
  );
}