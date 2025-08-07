'use client';

import { 
  AlertCircle,
  BarChart3,
  Clock, 
  History,
  MessageSquare, 
  Monitor,
  RefreshCw,
  Settings,
  Star,
  TrendingUp,
  Users} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect,useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { ActiveConversationsList } from './active-conversations-list';
import { ConversationChart } from './conversation-chart';
import { MetricCard } from './metric-card';
import { RecentConversationsTable } from './recent-conversations-table';

interface DashboardMetrics {
  activeConversations: number;
  todayConversations: number;
  todayMessages: number;
  avgResponseTime: number;
  humanInterventions: number;
  satisfactionScore: number;
}

interface Conversation {
  uuid: string;
  visitor_id: string;
  visitor_name?: string;
  visitor_email?: string;
  started_at: Date;
  ended_at?: Date;
  status: 'active' | 'waiting' | 'human_controlled' | 'ended';
  message_count: number;
  last_message_at?: Date;
  page_url?: string;
}

interface DashboardContentProps {
  chatUuid: string;
  metrics: DashboardMetrics;
  recentConversations: Conversation[];
  activeConversations: Conversation[];
}

export function DashboardContent({ 
  chatUuid, 
  metrics, 
  recentConversations: initialRecent, 
  activeConversations: initialActive 
}: DashboardContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeConversations, setActiveConversations] = useState(initialActive);
  const [recentConversations, setRecentConversations] = useState(initialRecent);
  
  // Check for error messages
  const error = searchParams.get('error');

  // Auto-refresh active conversations every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refreshData();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      // Refresh the page to get latest data
      router.refresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatResponseTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="space-y-6">
      {/* Error Alert */}
      {error === 'wrong-hub' && (
        <Alert className="border-orange-200 bg-orange-50 dark:bg-orange-900/20">
          <AlertCircle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800 dark:text-orange-200">
            This embedded chat belongs to a different Hub. Please switch to the correct Hub to access it.
          </AlertDescription>
        </Alert>
      )}
      
      {/* Quick Actions Bar */}
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshData}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Link href="/embedded-chat/monitor">
            <Button variant="outline" size="sm">
              <Monitor className="h-4 w-4 mr-2" />
              Live Monitor
            </Button>
          </Link>
          <Link href="/embedded-chat/analytics">
            <Button variant="outline" size="sm">
              <BarChart3 className="h-4 w-4 mr-2" />
              Analytics
            </Button>
          </Link>
        </div>
        <Link href={`/embedded-chat/${chatUuid}`}>
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Configuration
          </Button>
        </Link>
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          title="Active Chats"
          value={metrics.activeConversations}
          icon={Users}
          trend={metrics.activeConversations > 0 ? 'up' : 'neutral'}
          className="bg-green-50 dark:bg-green-950/20"
        />
        <MetricCard
          title="Today's Chats"
          value={metrics.todayConversations}
          icon={MessageSquare}
        />
        <MetricCard
          title="Messages"
          value={metrics.todayMessages}
          icon={TrendingUp}
        />
        <MetricCard
          title="Avg Response"
          value={formatResponseTime(metrics.avgResponseTime)}
          icon={Clock}
        />
        <MetricCard
          title="Interventions"
          value={metrics.humanInterventions}
          icon={AlertCircle}
          trend={metrics.humanInterventions > 0 ? 'down' : 'neutral'}
        />
        <MetricCard
          title="Satisfaction"
          value={`${metrics.satisfactionScore}%`}
          icon={Star}
          trend={metrics.satisfactionScore >= 80 ? 'up' : 'down'}
        />
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="active">Active Chats ({activeConversations.length})</TabsTrigger>
          <TabsTrigger value="recent">Recent Conversations</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Active Conversations Widget */}
            <div className="border rounded-lg p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Active Conversations</h3>
                <Link href="/embedded-chat/monitor">
                  <Button variant="ghost" size="sm">View All</Button>
                </Link>
              </div>
              <ActiveConversationsList 
                conversations={activeConversations.slice(0, 5)}
                chatUuid={chatUuid}
              />
            </div>

            {/* Chart */}
            <div className="border rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-4">Conversations Over Time</h3>
              <ConversationChart chatUuid={chatUuid} />
            </div>
          </div>

          {/* Recent Conversations */}
          <div className="border rounded-lg p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Recent Conversations</h3>
              <Link href="/embedded-chat/conversations">
                <Button variant="ghost" size="sm">
                  <History className="h-4 w-4 mr-2" />
                  View History
                </Button>
              </Link>
            </div>
            <RecentConversationsTable 
              conversations={recentConversations.slice(0, 10)}
              chatUuid={chatUuid}
            />
          </div>
        </TabsContent>

        <TabsContent value="active">
          <div className="border rounded-lg p-4">
            <ActiveConversationsList 
              conversations={activeConversations}
              chatUuid={chatUuid}
              showAll
            />
          </div>
        </TabsContent>

        <TabsContent value="recent">
          <div className="border rounded-lg p-4">
            <RecentConversationsTable 
              conversations={recentConversations}
              chatUuid={chatUuid}
              showAll
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}