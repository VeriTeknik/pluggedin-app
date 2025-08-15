'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Calendar, CheckCircle, Circle, Clock, Plus, Trash2, Edit, Brain, Workflow, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

// Helper to ensure absolute URLs for API calls
function getApiUrl(path: string) {
  // In production, use the origin. In development, ensure we use the correct base URL
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${path}`;
  }
  return path;
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string;
  memoryId?: string;
  workflowTaskId?: string;
  isWorkflowGenerated?: boolean;
  workflowMetadata?: any;
  createdAt: string;
  updatedAt: string;
}

interface TaskManagerProps {
  memories: any[];
  conversationId: string;
  chatUuid: string;
  visitorId?: string;
  className?: string;
}

export function TaskManager({ memories, conversationId, chatUuid, visitorId, className }: TaskManagerProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    dueDate: '',
    memoryId: ''
  });

  // Fetch tasks when component mounts or conversation changes
  useEffect(() => {
    fetchTasks();
  }, [conversationId, chatUuid, visitorId]);

  const fetchTasks = async () => {
    if (!conversationId) return;
    
    setIsLoading(true);
    try {
      const url = visitorId 
        ? `/api/embedded-chat/${chatUuid}/conversations/${conversationId}/tasks?userId=${visitorId}`
        : `/api/embedded-chat/${chatUuid}/conversations/${conversationId}/tasks`;
      const response = await fetch(getApiUrl(url));
      if (response.ok) {
        const data = await response.json();
        setTasks(data.tasks || []);
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createTask = async () => {
    if (!conversationId || !newTask.title.trim()) return;
    
    try {
      const url = visitorId 
        ? `/api/embedded-chat/${chatUuid}/conversations/${conversationId}/tasks?userId=${visitorId}`
        : `/api/embedded-chat/${chatUuid}/conversations/${conversationId}/tasks`;
      const response = await fetch(getApiUrl(url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTask),
      });
      
      if (response.ok) {
        const data = await response.json();
        setTasks(prev => [...prev, data.task]);
        setNewTask({
          title: '',
          description: '',
          priority: 'medium',
          dueDate: '',
          memoryId: ''
        });
        setIsDialogOpen(false);
      }
    } catch (error) {
      console.error('Error creating task:', error);
    }
  };

  const updateTask = async (taskId: string, updates: Partial<Task>) => {
    if (!conversationId) return;
    
    try {
      const url = visitorId 
        ? `/api/embedded-chat/${chatUuid}/conversations/${conversationId}/tasks/${taskId}?userId=${visitorId}`
        : `/api/embedded-chat/${chatUuid}/conversations/${conversationId}/tasks/${taskId}`;
      const response = await fetch(getApiUrl(url), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      
      if (response.ok) {
        const data = await response.json();
        setTasks(prev => prev.map(task => task.id === taskId ? data.task : task));
      }
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  const deleteTask = async (taskId: string) => {
    if (!conversationId) return;
    
    try {
      const url = visitorId 
        ? `/api/embedded-chat/${chatUuid}/conversations/${conversationId}/tasks/${taskId}?userId=${visitorId}`
        : `/api/embedded-chat/${chatUuid}/conversations/${conversationId}/tasks/${taskId}`;
      const response = await fetch(getApiUrl(url), {
        method: 'DELETE',
      });
      
      if (response.ok) {
        setTasks(prev => prev.filter(task => task.id !== taskId));
      }
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  const handleCreateTask = () => {
    setEditingTask(null);
    setNewTask({
      title: '',
      description: '',
      priority: 'medium',
      dueDate: '',
      memoryId: ''
    });
    setIsDialogOpen(true);
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setNewTask({
      title: task.title,
      description: task.description,
      priority: task.priority,
      dueDate: task.dueDate || '',
      memoryId: task.memoryId || ''
    });
    setIsDialogOpen(true);
  };

  const handleSaveTask = () => {
    if (editingTask) {
      updateTask(editingTask.id, newTask);
    } else {
      createTask();
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
      case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'low': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'in_progress': return <Clock className="w-4 h-4 text-blue-500" />;
      default: return <Circle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getTasksByStatus = (status: string) => {
    return tasks.filter(task => task.status === status);
  };

  const getMemoryContent = (memoryId: string) => {
    const memory = memories.find(m => m.id === memoryId);
    return memory ? memory.content : '';
  };

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center p-4", className)}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Brain className="w-5 h-5" />
          Task Manager
        </h3>
        <Button onClick={handleCreateTask} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          New Task
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(['todo', 'in_progress', 'completed'] as const).map(status => (
          <Card key={status} className="h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                {getStatusIcon(status)}
                {status === 'todo' ? 'To Do' : status === 'in_progress' ? 'In Progress' : 'Completed'}
                <Badge variant="secondary" className="ml-auto">
                  {getTasksByStatus(status).length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {getTasksByStatus(status).map(task => (
                <Card 
                  key={task.id} 
                  className={cn(
                    "p-3 cursor-pointer hover:shadow-md transition-shadow",
                    task.isWorkflowGenerated && "border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10"
                  )}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2">
                        {task.isWorkflowGenerated && (
                          <Workflow className="w-4 h-4 text-purple-500 mt-0.5" title="AI Workflow Task" />
                        )}
                        <h4 className="font-medium text-sm">{task.title}</h4>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditTask(task)}
                          className="h-6 w-6 p-0"
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteTask(task.id)}
                          className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    
                    {task.description && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                        {task.description}
                      </p>
                    )}
                    
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={cn("text-xs", getPriorityColor(task.priority))}>
                        {task.priority}
                      </Badge>
                      
                      {task.dueDate && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Calendar className="w-3 h-3" />
                          {new Date(task.dueDate).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    
                    {task.memoryId && (
                      <div className="text-xs text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 p-2 rounded">
                        <strong>Related Memory:</strong> {getMemoryContent(task.memoryId)}
                      </div>
                    )}
                    
                    {task.workflowMetadata && (
                      <div className="text-xs text-purple-600 dark:text-purple-400 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 p-2 rounded flex items-center gap-2">
                        <Bot className="w-3 h-3" />
                        <span>
                          <strong>Workflow:</strong> {task.workflowMetadata.template || 'AI Generated'}
                          {task.workflowMetadata.step && ` • Step ${task.workflowMetadata.step}`}
                        </span>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
              
              {getTasksByStatus(status).length === 0 && (
                <p className="text-xs text-gray-500 text-center py-4">
                  No tasks in this column
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTask ? 'Edit Task' : 'Create New Task'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Title</label>
              <Input
                value={newTask.title}
                onChange={(e) => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Task title"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={newTask.description}
                onChange={(e) => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Task description"
                rows={3}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Priority</label>
                <Select value={newTask.priority} onValueChange={(value: any) => setNewTask(prev => ({ ...prev, priority: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-sm font-medium">Due Date</label>
                <Input
                  type="date"
                  value={newTask.dueDate}
                  onChange={(e) => setNewTask(prev => ({ ...prev, dueDate: e.target.value }))}
                />
              </div>
            </div>
            
            {memories.length > 0 && (
              <div>
                <label className="text-sm font-medium">Related Memory (Optional)</label>
                <Select value={newTask.memoryId} onValueChange={(value) => setNewTask(prev => ({ ...prev, memoryId: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a memory" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No related memory</SelectItem>
                    {memories.map(memory => (
                      <SelectItem key={memory.id} value={memory.id}>
                        {memory.content.substring(0, 50)}...
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveTask} disabled={!newTask.title.trim()}>
                {editingTask ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}