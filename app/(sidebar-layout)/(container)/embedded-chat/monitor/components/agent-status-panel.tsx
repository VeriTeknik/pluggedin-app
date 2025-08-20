'use client';

import { format } from 'date-fns';
import { 
  Clock,
  MessageSquare,
  User,
  UserCheck,
  Users,
  UserX} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Agent {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  status: 'available' | 'busy' | 'away' | 'offline';
  activeConversations: number;
  totalConversations: number;
  avgResponseTime: number;
  lastActive: Date;
  workload: 'light' | 'medium' | 'heavy';
}

interface ConversationQueueItem {
  uuid: string;
  visitor_name?: string;
  visitor_id: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  waitTime: number;
  status: 'waiting' | 'active';
  started_at: Date;
}

interface AgentStatusPanelProps {
  chatUuid: string;
}

export function AgentStatusPanel({ chatUuid }: AgentStatusPanelProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [conversationQueue, setConversationQueue] = useState<ConversationQueueItem[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  // Mock data - in real implementation, this would come from API
  useEffect(() => {
    const mockAgents: Agent[] = [
      {
        id: 'agent-1',
        name: 'Sarah Johnson',
        email: 'sarah@company.com',
        avatar: '',
        status: 'available',
        activeConversations: 2,
        totalConversations: 15,
        avgResponseTime: 45,
        lastActive: new Date(),
        workload: 'light'
      },
      {
        id: 'agent-2',
        name: 'Mike Chen',
        email: 'mike@company.com',
        avatar: '',
        status: 'busy',
        activeConversations: 5,
        totalConversations: 32,
        avgResponseTime: 120,
        lastActive: new Date(Date.now() - 5 * 60 * 1000),
        workload: 'heavy'
      },
      {
        id: 'agent-3',
        name: 'Emma Davis',
        email: 'emma@company.com',
        avatar: '',
        status: 'away',
        activeConversations: 1,
        totalConversations: 8,
        avgResponseTime: 60,
        lastActive: new Date(Date.now() - 30 * 60 * 1000),
        workload: 'light'
      }
    ];

    const mockQueue: ConversationQueueItem[] = [
      {
        uuid: 'queue-1',
        visitor_name: 'John Smith',
        visitor_id: 'visitor-123',
        priority: 'high',
        waitTime: 180,
        status: 'waiting',
        started_at: new Date(Date.now() - 3 * 60 * 1000)
      },
      {
        uuid: 'queue-2',
        visitor_name: 'Alice Brown',
        visitor_id: 'visitor-456',
        priority: 'medium',
        waitTime: 300,
        status: 'waiting',
        started_at: new Date(Date.now() - 5 * 60 * 1000)
      }
    ];

    setAgents(mockAgents);
    setConversationQueue(mockQueue);
    setIsLoading(false);
  }, [chatUuid]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-500';
      case 'busy':
        return 'bg-red-500';
      case 'away':
        return 'bg-yellow-500';
      case 'offline':
        return 'bg-gray-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'available':
        return <UserCheck className="h-4 w-4" />;
      case 'busy':
        return <UserX className="h-4 w-4" />;
      case 'away':
        return <Clock className="h-4 w-4" />;
      case 'offline':
        return <User className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-600 text-white';
      case 'high':
        return 'bg-orange-500 text-white';
      case 'medium':
        return 'bg-blue-500 text-white';
      case 'low':
        return 'bg-gray-500 text-white';
      default:
        return 'bg-gray-400 text-white';
    }
  };

  const getWorkloadColor = (workload: string) => {
    switch (workload) {
      case 'light':
        return 'text-green-600';
      case 'medium':
        return 'text-yellow-600';
      case 'heavy':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const assignConversation = async (conversationId: string, agentId: string) => {
    try {
      const response = await fetch(`/api/embedded-chat/${chatUuid}/takeover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId,
          action: 'assign',
          agentId,
          reason: 'Manual assignment from agent panel',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to assign conversation');
      }

      // Remove from queue and update agent stats
      setConversationQueue(prev => prev.filter(conv => conv.uuid !== conversationId));
      setAgents(prev => prev.map(agent => 
        agent.id === agentId 
          ? { ...agent, activeConversations: agent.activeConversations + 1 }
          : agent
      ));
    } catch (error) {
      console.error('Failed to assign conversation:', error);
    }
  };

  const formatWaitTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-20 bg-gray-200 rounded"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Agent Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Agent Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={agent.avatar} />
                      <AvatarFallback>
                        {agent.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white ${getStatusColor(agent.status)}`} />
                  </div>
                  <div>
                    <p className="font-medium">{agent.name}</p>
                    <p className="text-sm text-muted-foreground">{agent.email}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 text-sm">
                  <div className="text-center">
                    <p className="font-medium">{agent.activeConversations}</p>
                    <p className="text-muted-foreground">Active</p>
                  </div>
                  <div className="text-center">
                    <p className="font-medium">{agent.avgResponseTime}s</p>
                    <p className="text-muted-foreground">Avg Response</p>
                  </div>
                  <div className="text-center">
                    <p className={`font-medium capitalize ${getWorkloadColor(agent.workload)}`}>
                      {agent.workload}
                    </p>
                    <p className="text-muted-foreground">Workload</p>
                  </div>
                  <Badge 
                    variant="outline" 
                    className={`${getStatusColor(agent.status)} text-white border-none`}
                  >
                    <span className="flex items-center gap-1">
                      {getStatusIcon(agent.status)}
                      {agent.status}
                    </span>
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Conversation Queue */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Conversation Queue ({conversationQueue.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {conversationQueue.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No conversations waiting for assignment
            </p>
          ) : (
            <div className="space-y-3">
              {conversationQueue.map((conversation) => (
                <div
                  key={conversation.uuid}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Badge className={getPriorityColor(conversation.priority)}>
                      {conversation.priority.toUpperCase()}
                    </Badge>
                    <div>
                      <p className="font-medium">
                        {conversation.visitor_name || `Visitor ${conversation.visitor_id.slice(0, 8)}`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Waiting: {formatWaitTime(conversation.waitTime)} • 
                        Started: {format(conversation.started_at, 'HH:mm')}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Select 
                      value={selectedAgent} 
                      onValueChange={setSelectedAgent}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Assign to..." />
                      </SelectTrigger>
                      <SelectContent>
                        {agents
                          .filter(agent => agent.status === 'available' || agent.workload !== 'heavy')
                          .map((agent) => (
                          <SelectItem key={agent.id} value={agent.id}>
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${getStatusColor(agent.status)}`} />
                              {agent.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button 
                      size="sm"
                      onClick={() => selectedAgent && assignConversation(conversation.uuid, selectedAgent)}
                      disabled={!selectedAgent}
                    >
                      Assign
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">
                {agents.filter(a => a.status === 'available').length}
              </p>
              <p className="text-sm text-muted-foreground">Available Agents</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">
                {agents.reduce((sum, agent) => sum + agent.activeConversations, 0)}
              </p>
              <p className="text-sm text-muted-foreground">Active Conversations</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-600">
                {conversationQueue.length}
              </p>
              <p className="text-sm text-muted-foreground">In Queue</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-600">
                {Math.round(agents.reduce((sum, agent) => sum + agent.avgResponseTime, 0) / agents.length)}s
              </p>
              <p className="text-sm text-muted-foreground">Avg Response Time</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}