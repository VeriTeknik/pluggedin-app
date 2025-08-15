'use client';

import { CheckCircle, Loader2, Plus, Workflow } from 'lucide-react';
import { useCallback, useEffect, useState, useRef } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { createNotification } from '@/app/actions/notifications';

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
  created_at: string;
}

interface WorkflowInstance {
  id: string;
  conversation_id: string;
  template_id?: string;
  template_name?: string;
  status: 'planning' | 'active' | 'completed' | 'failed' | 'cancelled';
  tasks?: WorkflowTask[];
  created_at: string;
}

interface SimpleTodoListProps {
  conversationId: string;
  chatUuid: string;
  visitorId?: string;
  className?: string;
}

export function SimpleTodoList({
  conversationId,
  chatUuid,
  visitorId,
  className
}: SimpleTodoListProps) {
  const [workflows, setWorkflows] = useState<WorkflowInstance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [taskFilter, setTaskFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [notifying, setNotifying] = useState<string | null>(null);
  const [newTaskIds, setNewTaskIds] = useState<Set<string>>(new Set());
  const prevTasksRef = useRef<WorkflowTask[]>([]);

  const fetchWorkflows = useCallback(async () => {
    if (!conversationId) return;
    
    setIsLoading(true);
    try {
      const url = visitorId 
        ? `/api/embedded-chat/${chatUuid}/conversations/${conversationId}/workflows?userId=${visitorId}`
        : `/api/embedded-chat/${chatUuid}/conversations/${conversationId}/workflows`;
      
      const response = await fetch(getApiUrl(url));
      
      if (response.ok) {
        const data = await response.json();
        setWorkflows(data.workflows || []);
      }
    } catch (error) {
      console.error('[SimpleTodoList] Error fetching workflows:', error);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, chatUuid, visitorId]);

  // Set up real-time updates using SSE
  useEffect(() => {
    if (!conversationId) return;
    
    // Initial fetch
    fetchWorkflows();
    
    // Set up SSE connection for real-time updates
    let eventSource: EventSource | null = null;
    
    const setupSSE = () => {
      const url = visitorId
        ? `/api/embedded-chat/${chatUuid}/conversations/${conversationId}/workflows/stream?userId=${visitorId}`
        : `/api/embedded-chat/${chatUuid}/conversations/${conversationId}/workflows/stream`;
      
      eventSource = new EventSource(getApiUrl(url));
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'initial' || data.type === 'update') {
            // Get current tasks before update
            const currentTasks = workflows.flatMap(w => w.tasks || []);
            prevTasksRef.current = currentTasks;
            
            setWorkflows(data.workflows || []);
            
            // Check for new tasks
            const newTasks = (data.workflows || [])
              .flatMap((w: WorkflowInstance) => w.tasks || [])
              .filter((newTask: WorkflowTask) =>
                !currentTasks.some(existingTask => existingTask.id === newTask.id)
              );
            
            if (newTasks.length > 0) {
              // Add animation for new tasks
              const newIds = new Set(newTaskIds);
              newTasks.forEach((task: WorkflowTask) => newIds.add(task.id));
              setNewTaskIds(newIds);
              
              // Remove animation after delay
              setTimeout(() => {
                setNewTaskIds(prev => {
                  const updated = new Set(prev);
                  newTasks.forEach((task: WorkflowTask) => updated.delete(task.id));
                  return updated;
                });
              }, 3000);
            }
          } else if (data.type === 'error') {
            console.error('[SimpleTodoList] SSE error:', data.message);
          }
        } catch (error) {
          console.error('[SimpleTodoList] Error parsing SSE message:', error);
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('[SimpleTodoList] SSE connection error:', error);
        // Attempt to reconnect after a delay
        if (eventSource) {
          eventSource.close();
        }
        setTimeout(setupSSE, 3000); // Reconnect after 3 seconds
      };
      
      eventSource.onopen = () => {
        console.log('[SimpleTodoList] SSE connection established');
      };
    };
    
    setupSSE();
    
    // Clean up on unmount
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [conversationId, chatUuid, visitorId, fetchWorkflows]);

  const handleTaskToggle = async (taskId: string, workflowId: string, completed: boolean) => {
    setIsUpdating(true);
    try {
      // Update the task status in the workflow
      const baseUrl = `/api/embedded-chat/${chatUuid}/conversations/${conversationId}/workflows/${workflowId}/execute`;
      const url = visitorId ? `${baseUrl}?userId=${encodeURIComponent(visitorId)}` : baseUrl;
      
      const response = await fetch(getApiUrl(url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: completed ? 'complete' : 'fail',
          taskId,
          data: { completed }
        }),
      });
      
      if (response.ok) {
        // Find the task that was updated
        const task = workflows
          .flatMap(w => w.tasks || [])
          .find(t => t.id === taskId);
        
        if (task && completed) {
          setNotifying(taskId);
          
          // Create in-app notification
          await createNotification({
            profileUuid: visitorId || '',
            type: 'SUCCESS',
            title: 'Task Completed',
            message: `"${task.title}" has been completed`,
            severity: 'SUCCESS',
            metadata: {
              source: {
                type: 'mcp',
                mcpServer: 'task_manager',
                profileUuid: visitorId
              },
              actions: {
                completedAt: new Date().toISOString(),
                completedProfileUuid: visitorId,
                completedVia: 'web'
              },
              task: {
                tags: ['workflow-task'],
                priority: 'medium',
                relatedItems: [
                  {
                    type: 'profile',
                    id: visitorId || '',
                    name: 'User'
                  }
                ]
              },
              custom: {
                taskId,
                conversationId,
                workflowId,
                taskTitle: task.title,
                taskDescription: task.description,
                taskType: task.type
              }
            },
            expiresInDays: 7
          });

          // Send external notifications (Slack/Email) for task completion
          await sendExternalNotifications(task, visitorId || '', conversationId);
          
          setNotifying(null);
        }
        
        // Refresh the workflows to get updated task status
        await fetchWorkflows();
      }
    } catch (error) {
      console.error('[SimpleTodoList] Error updating task:', error);
    } finally {
      setIsUpdating(false);
      setNotifying(null);
    }
  };

  const sendExternalNotifications = async (task: WorkflowTask, profileUuid: string, conversationId: string) => {
    try {
      // Send Slack notification
      await fetch('/api/integrations/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'slack',
          profileUuid,
          conversationId,
          message: `✅ Task completed: "${task.title}"`,
          details: {
            taskId: task.id,
            taskTitle: task.title,
            taskDescription: task.description,
            taskType: task.type,
            completedAt: new Date().toISOString()
          }
        })
      });

      // Send Email notification
      await fetch('/api/integrations/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'email',
          profileUuid,
          conversationId,
          subject: `Task Completed: ${task.title}`,
          message: `The following task has been completed:\n\nTitle: ${task.title}\n${task.description ? `Description: ${task.description}\n` : ''}Type: ${task.type}\nCompleted at: ${new Date().toLocaleString()}`,
          details: {
            taskId: task.id,
            taskTitle: task.title,
            taskDescription: task.description,
            taskType: task.type,
            completedAt: new Date().toISOString()
          }
        })
      });
    } catch (error) {
      console.error('Error sending external notifications:', error);
      // Don't throw here as we don't want to fail the task completion
    }
  };

  // Get all tasks from all workflows
  const allTasks = workflows
    .flatMap(w => (w.tasks || []).map(t => ({ ...t, workflow_id: w.id, workflow_name: w.template_name, workflow_status: w.status })));

  // Filter tasks based on selected filter
  const filteredTasks = allTasks.filter(task => {
    if (taskFilter === 'all') return true;
    if (taskFilter === 'active') return task.status === 'active' || task.status === 'pending';
    if (taskFilter === 'completed') return task.status === 'completed';
    return true;
  });

  // Sort tasks by status (active first, then pending, then completed) and creation date
  const sortedTasks = filteredTasks.sort((a, b) => {
    // Active tasks first
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (a.status !== 'active' && b.status === 'active') return 1;
    
    // Then pending tasks
    if (a.status === 'pending' && b.status !== 'pending' && b.status !== 'active') return -1;
    if (a.status !== 'pending' && a.status !== 'active' && b.status === 'pending') return 1;
    
    // Then completed tasks
    if (a.status === 'completed' && b.status !== 'completed' && b.status !== 'active' && b.status !== 'pending') return 1;
    if (a.status !== 'completed' && a.status !== 'active' && a.status !== 'pending' && b.status === 'completed') return -1;
    
    // Within the same status group, sort by creation date (newest first)
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  if (isLoading && workflows.length === 0) {
    return (
      <div className={cn("flex items-center justify-center p-4", className)}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (sortedTasks.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center p-4 text-center", className)}>
        <Workflow className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          No tasks found. Tasks will appear here when workflows are created.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <Workflow className="w-4 h-4" />
          Workflow Tasks
        </h3>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {sortedTasks.filter(t => t.status === 'completed').length} of {sortedTasks.length} completed
        </div>
      </div>
      
      {/* Task filter buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => setTaskFilter('all')}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            taskFilter === 'all'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
          }`}
        >
          All ({allTasks.length})
        </button>
        <button
          onClick={() => setTaskFilter('active')}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            taskFilter === 'active'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
          }`}
        >
          Active ({allTasks.filter(t => t.status === 'active' || t.status === 'pending').length})
        </button>
        <button
          onClick={() => setTaskFilter('completed')}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            taskFilter === 'completed'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
          }`}
        >
          Completed ({allTasks.filter(t => t.status === 'completed').length})
        </button>
      </div>
      
      <ScrollArea className="max-h-48 pr-2">
        <div className="space-y-2">
          {sortedTasks.map((task) => (
            <div
              key={task.id}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border transition-all duration-300",
                task.status === 'active' && "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800",
                task.status === 'completed' && "opacity-60",
                newTaskIds.has(task.id) && "animate-pulse bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"
              )}
            >
              <div className="mt-0.5">
                <Checkbox
                  id={task.id}
                  checked={task.status === 'completed'}
                  onCheckedChange={(checked) =>
                    handleTaskToggle(task.id, task.workflow_id, checked as boolean)
                  }
                  disabled={isUpdating || notifying === task.id}
                />
              </div>
              <div className="flex-1 space-y-1">
                <label
                  htmlFor={task.id}
                  className={cn(
                    "text-sm font-medium cursor-pointer",
                    task.status === 'completed' && "line-through text-gray-500 dark:text-gray-400"
                  )}
                >
                  {task.title}
                </label>
                {task.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {task.description}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  {newTaskIds.has(task.id) && (
                    <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 animate-pulse">
                      <Plus className="h-3 w-3" />
                      New
                    </span>
                  )}
                  <span className={cn(
                    "text-xs px-1.5 py-0.5 rounded",
                    task.type === 'gather' && "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
                    task.type === 'validate' && "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
                    task.type === 'execute' && "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
                    task.type === 'confirm' && "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
                    task.type === 'decision' && "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
                    task.type === 'notify' && "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300"
                  )}>
                    {task.type}
                  </span>
                  {task.status === 'active' && (
                    <span className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Active
                    </span>
                  )}
                  {task.status === 'completed' && (
                    <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                      {notifying === task.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle className="h-3 w-3" />
                      )}
                      {notifying === task.id ? 'Notifying...' : 'Completed'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}