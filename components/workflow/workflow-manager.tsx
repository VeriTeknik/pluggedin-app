'use client';

import { format } from 'date-fns';
import { 
  AlertCircle,
  Brain,
  CheckCircle2,
  Circle,
  Loader2,
  PlayCircle,
  Workflow,
  XCircle
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

// Helper to ensure absolute URLs for API calls
function getApiUrl(path: string) {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${path}`;
  }
  return path;
}

interface WorkflowTask {
  id: string;
  workflow_id: string;
  step_id: string;
  title: string;
  description: string;
  type: 'gather' | 'validate' | 'execute' | 'confirm' | 'decision' | 'notify';
  status: 'pending' | 'active' | 'completed' | 'failed' | 'skipped';
  required_data?: any;
  actual_data?: any;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  created_at: string;
}

interface WorkflowInstance {
  id: string;
  conversation_id: string;
  template_id?: string;
  template_name?: string;
  status: 'planning' | 'active' | 'completed' | 'failed' | 'cancelled';
  context?: any;
  learned_optimizations?: any;
  started_at?: string;
  completed_at?: string;
  failure_reason?: string;
  created_at: string;
  tasks?: WorkflowTask[];
}

interface WorkflowManagerProps {
  conversationId: string;
  chatUuid: string;
  visitorId?: string;
  className?: string;
  onTaskComplete?: (taskId: string) => void;
  onWorkflowComplete?: (workflowId: string) => void;
  variant?: 'compact' | 'full';
}

export function WorkflowManager({
  conversationId,
  chatUuid,
  visitorId,
  className,
  onTaskComplete,
  onWorkflowComplete,
  variant = 'compact'
}: WorkflowManagerProps) {
  const [workflows, setWorkflows] = useState<WorkflowInstance[]>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [selectedTab, setSelectedTab] = useState('active');

  // Calculate selected workflow, progress, and current task before any conditional returns
  const selectedWorkflow = workflows.find(w => w.id === activeWorkflowId) || workflows[0];
  const progress = useMemo(
    () => selectedWorkflow?.tasks
      ? (selectedWorkflow.tasks.filter(t => t.status === 'completed').length / selectedWorkflow.tasks.length) * 100
      : 0,
    [selectedWorkflow]
  );
  const currentTask = useMemo(
    () => ((selectedWorkflow?.tasks || []).find(t => t.status === 'active')
      || (selectedWorkflow?.tasks || []).find(t => t.status === 'pending')),
    [selectedWorkflow]
  );

  const fetchWorkflows = useCallback(async () => {
    if (!conversationId) return;
    
    setIsLoading(true);
    try {
      const url = visitorId 
        ? `/api/embedded-chat/${chatUuid}/conversations/${conversationId}/workflows?userId=${visitorId}`
        : `/api/embedded-chat/${chatUuid}/conversations/${conversationId}/workflows`;
      
      console.log('[WorkflowManager] Fetching workflows from:', url);
      const response = await fetch(getApiUrl(url));
      
      if (response.ok) {
        const data = await response.json();
        console.log('[WorkflowManager] Fetched workflows:', data.workflows?.length || 0);
        setWorkflows(data.workflows || []);
        
        // Set active workflow - prioritize active/planning, but show any workflow
        const active = data.workflows?.find((w: WorkflowInstance) => 
          w.status === 'active' || w.status === 'planning'
        );
        
        if (active) {
          setActiveWorkflowId(active.id);
        } else if (data.workflows?.length > 0) {
          // If no active workflow, show the most recent one
          setActiveWorkflowId(data.workflows[0].id);
        }
      }
    } catch (error) {
      console.error('[WorkflowManager] Error fetching workflows:', error);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, chatUuid, visitorId]);

  // Fetch workflows when component mounts or conversation changes
  useEffect(() => {
    fetchWorkflows();
    const interval = setInterval(() => {
      if (workflows.some(w => w.status === 'active' || w.status === 'planning')) {
        fetchWorkflows();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchWorkflows, workflows.length]);

  const executeNextTask = useCallback(async (workflowId: string) => {
    setIsExecuting(true);
    try {
      const baseUrl = `/api/embedded-chat/${chatUuid}/conversations/${conversationId}/workflows/${workflowId}/execute`;
      const url = visitorId ? `${baseUrl}?userId=${encodeURIComponent(visitorId)}` : baseUrl;
      const response = await fetch(getApiUrl(url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'next' }),
      });
      
      if (response.ok) {
        const data = await response.json();
        // If the task requires user input, don't keep sending next blindly
        if (data.requiresInput) {
          setIsExecuting(false);
          await fetchWorkflows();
          return;
        }
        if (data.completed && onWorkflowComplete) {
          onWorkflowComplete(workflowId);
        } else if (data.taskCompleted && onTaskComplete) {
          onTaskComplete(data.taskId);
        }
        await fetchWorkflows();
      }
    } catch (error) {
      console.error('Error executing workflow task:', error);
    } finally {
      setIsExecuting(false);
    }
  }, [chatUuid, conversationId, visitorId]);

  // Auto-start: if there's an active workflow with no active task, kick off next task
  useEffect(() => {
    const active = workflows.find(w => w.status === 'active' || w.status === 'planning');
    if (!active) return;
    const hasActiveTask = (active.tasks || []).some(t => t.status === 'active');
    if (!hasActiveTask && !isExecuting) {
      executeNextTask(active.id);
    }
  }, [workflows, isExecuting, executeNextTask]);

  const cancelWorkflow = async (workflowId: string) => {
    try {
      const url = `/api/embedded-chat/${chatUuid}/conversations/${conversationId}/workflows/${workflowId}/cancel`;
      const response = await fetch(getApiUrl(url), {
        method: 'POST',
      });
      
      if (response.ok) {
        await fetchWorkflows();
      }
    } catch (error) {
      console.error('Error cancelling workflow:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'active':
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'skipped':
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
      default:
        return <Circle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getTaskTypeColor = (type: string) => {
    switch (type) {
      case 'gather':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'validate':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'execute':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'confirm':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'decision':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
      case 'notify':
        return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  // Deduplicate workflows - only show the latest one for each template
  const deduplicatedWorkflows = workflows.reduce((acc, workflow) => {
    const key = workflow.template_name || 'default';
    const existing = acc.find(w => (w.template_name || 'default') === key);
    if (!existing || new Date(workflow.created_at) > new Date(existing.created_at)) {
      return [...acc.filter(w => (w.template_name || 'default') !== key), workflow];
    }
    return acc;
  }, [] as WorkflowInstance[]);

  const activeWorkflows = deduplicatedWorkflows.filter(w => w.status === 'active' || w.status === 'planning');
  const completedWorkflows = deduplicatedWorkflows.filter(w => w.status === 'completed');
  const failedWorkflows = deduplicatedWorkflows.filter(w => w.status === 'failed' || w.status === 'cancelled');

  if (isLoading && workflows.length === 0) {
    return (
      <div className={cn("flex items-center justify-center p-8", className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (workflows.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center p-8 text-center", className)}>
        <Workflow className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground">
          No workflows active. Workflows will appear here when complex tasks are detected.
        </p>
      </div>
    );
  }

  // Use the pre-calculated values from the top of the component

  // Compact variant: small inline status chip; no controls
  const renderCompact = () => {
    if (!selectedWorkflow) return null;
    const total = selectedWorkflow.tasks?.length || 0;
    const completed = selectedWorkflow.tasks?.filter(t => t.status === 'completed').length || 0;
    return (
      <div className={cn('flex items-center gap-2 text-xs rounded-md border px-3 py-2 bg-background/60 backdrop-blur', className)}>
        <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
        <span className="font-medium">Working</span>
        <span className="text-muted-foreground">{selectedWorkflow.template_name || 'Workflow'}</span>
        <span className="text-muted-foreground">• {Math.round(progress)}%</span>
        {currentTask?.title && (
          <span className="truncate text-muted-foreground">• {currentTask.title}</span>
        )}
        <span className="text-muted-foreground">({completed}/{total})</span>
      </div>
    );
  };
  if (variant === 'compact') return renderCompact();

  return (
    <div className={cn("space-y-4", className)}>
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="active" className="relative">
            Active
            {activeWorkflows.length > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 px-1">
                {activeWorkflows.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed
            {completedWorkflows.length > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 px-1">
                {completedWorkflows.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="failed">
            Failed
            {failedWorkflows.length > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 px-1">
                {failedWorkflows.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {activeWorkflows.length === 0 && workflows.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Brain className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No active workflows</p>
              </CardContent>
            </Card>
          ) : (
            (activeWorkflows.length > 0 ? activeWorkflows : workflows).map(workflow => (
              <Card key={workflow.id} className={cn(
                "overflow-hidden border-2 transition-all",
                workflow.status === 'active' && "border-blue-500 shadow-lg",
                workflow.status === 'planning' && "border-purple-500 shadow-lg"
              )}>
                <CardHeader className="pb-3 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Workflow className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      <CardTitle className="text-lg">
                        {workflow.template_name || 'Workflow'}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={workflow.status === 'active' ? 'default' : 'secondary'}
                        className={cn(
                          workflow.status === 'active' && "bg-blue-500 animate-pulse",
                          workflow.status === 'planning' && "bg-purple-500"
                        )}
                      >
                        {workflow.status === 'planning' ? '🔄 Planning' : workflow.status}
                      </Badge>
                      {workflow.status === 'active' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => cancelWorkflow(workflow.id)}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {workflow.started_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Started {format(new Date(workflow.started_at), 'PPp')}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Progress</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>

                  {/* Task List */}
                  {workflow.tasks && workflow.tasks.length > 0 && (
                    <ScrollArea className="h-64 pr-4">
                      <div className="space-y-2">
                        {workflow.tasks.map((task, index) => (
                          <div
                            key={task.id}
                            className={cn(
                              "flex items-start gap-3 p-3 rounded-lg border",
                              task.status === 'active' && "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800",
                              task.status === 'completed' && "opacity-60"
                            )}
                          >
                            <div className="mt-0.5">
                              {getStatusIcon(task.status)}
                            </div>
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm">{task.title}</p>
                                <Badge variant="outline" className={cn("text-xs", getTaskTypeColor(task.type))}>
                                  {task.type}
                                </Badge>
                              </div>
                              {task.description && (
                                <p className="text-xs text-muted-foreground">{task.description}</p>
                              )}
                              {task.error_message && (
                                <p className="text-xs text-red-600 dark:text-red-400">{task.error_message}</p>
                              )}
                              {task.status === 'active' && (
                                <div className="flex items-center gap-2 mt-2">
                                  <Button
                                    size="sm"
                                    onClick={() => executeNextTask(workflow.id)}
                                    disabled={isExecuting}
                                  >
                                    {isExecuting ? (
                                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    ) : (
                                      <PlayCircle className="h-3 w-3 mr-1" />
                                    )}
                                    Continue
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}

                  {/* Action Buttons */}
                  {workflow.status === 'planning' && (
                    <div className="flex justify-end">
                      <Button
                        onClick={() => executeNextTask(workflow.id)}
                        disabled={isExecuting}
                      >
                        {isExecuting ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <PlayCircle className="h-4 w-4 mr-2" />
                        )}
                        Start Workflow
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          {completedWorkflows.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <CheckCircle2 className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No completed workflows</p>
              </CardContent>
            </Card>
          ) : (
            completedWorkflows.map(workflow => (
              <Card key={workflow.id} className="opacity-75">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">
                      {workflow.template_name || 'Workflow'}
                    </CardTitle>
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                  {workflow.completed_at && (
                    <p className="text-xs text-muted-foreground">
                      Completed {format(new Date(workflow.completed_at), 'PPp')}
                    </p>
                  )}
                </CardHeader>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="failed" className="space-y-4">
          {failedWorkflows.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <XCircle className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No failed workflows</p>
              </CardContent>
            </Card>
          ) : (
            failedWorkflows.map(workflow => (
              <Card key={workflow.id} className="border-red-200 dark:border-red-800">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">
                      {workflow.template_name || 'Workflow'}
                    </CardTitle>
                    <XCircle className="h-5 w-5 text-red-600" />
                  </div>
                  {workflow.failure_reason && (
                    <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                      {workflow.failure_reason}
                    </p>
                  )}
                </CardHeader>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}