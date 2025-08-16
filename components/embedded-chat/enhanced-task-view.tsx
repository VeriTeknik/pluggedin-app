'use client';

import {
  CheckCircle2,
  Circle,
  Clock,
  ListTodo,
  ChevronRight,
  Calendar,
  User,
  AlertCircle,
  Sparkles,
  X
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'active' | 'completed';
  priority?: 'low' | 'medium' | 'high';
  dueDate?: Date;
  assignee?: string;
  workflowId?: string;
  parentTaskId?: string;
  subtasks?: Task[];
}

interface EnhancedTaskViewProps {
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
  onTaskComplete?: (taskId: string) => void;
  onClose?: () => void;
  className?: string;
}

export function EnhancedTaskView({
  tasks,
  onTaskClick,
  onTaskComplete,
  onClose,
  className
}: EnhancedTaskViewProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'completed'>('all');
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  const filteredTasks = tasks.filter(task => {
    if (activeTab === 'all') return true;
    if (activeTab === 'active') return task.status === 'active' || task.status === 'pending';
    if (activeTab === 'completed') return task.status === 'completed';
    return true;
  });

  const activeTasks = tasks.filter(t => t.status === 'active' || t.status === 'pending');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  const toggleTaskExpanded = (taskId: string) => {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
    }
    setExpandedTasks(newExpanded);
  };

  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'active':
        return (
          <div className="relative">
            <Circle className="h-5 w-5 text-blue-500" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
            </div>
          </div>
        );
      case 'pending':
      default:
        return <Circle className="h-5 w-5 text-gray-400" />;
    }
  };

  const getPriorityColor = (priority?: Task['priority']) => {
    switch (priority) {
      case 'high':
        return 'text-red-500';
      case 'medium':
        return 'text-yellow-500';
      case 'low':
        return 'text-gray-400';
      default:
        return 'text-gray-400';
    }
  };

  const renderTask = (task: Task, depth = 0) => {
    const isExpanded = expandedTasks.has(task.id);
    const hasSubtasks = task.subtasks && task.subtasks.length > 0;

    return (
      <div key={task.id} className="group">
        <div
          className={cn(
            "flex items-start gap-3 p-3 rounded-lg transition-all duration-200",
            "hover:bg-white/5 cursor-pointer",
            task.status === 'completed' && "opacity-60",
            depth > 0 && "ml-8"
          )}
          style={{ marginLeft: depth > 0 ? `${depth * 2}rem` : 0 }}
          onClick={() => onTaskClick?.(task)}
        >
          <button
            className="mt-0.5 transition-transform duration-200 hover:scale-110"
            onClick={(e) => {
              e.stopPropagation();
              onTaskComplete?.(task.id);
            }}
          >
            {getStatusIcon(task.status)}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <h4 className={cn(
                  "font-medium text-white",
                  task.status === 'completed' && "line-through text-gray-400"
                )}>
                  {task.title}
                </h4>
                {task.description && (
                  <p className="text-sm text-gray-400 mt-1">
                    {task.description}
                  </p>
                )}
              </div>

              {hasSubtasks && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTaskExpanded(task.id);
                  }}
                  className="p-1 hover:bg-white/10 rounded transition-all duration-200"
                >
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 text-gray-400 transition-transform duration-200",
                      isExpanded && "rotate-90"
                    )}
                  />
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 mt-2">
              {task.priority && (
                <span className={cn("text-xs flex items-center gap-1", getPriorityColor(task.priority))}>
                  <AlertCircle className="h-3 w-3" />
                  {task.priority}
                </span>
              )}
              
              {task.dueDate && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(task.dueDate).toLocaleDateString()}
                </span>
              )}

              {task.assignee && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {task.assignee}
                </span>
              )}

              {task.status === 'active' && (
                <span className="text-xs text-blue-400 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  In Progress
                </span>
              )}
            </div>
          </div>
        </div>

        {hasSubtasks && isExpanded && (
          <div className="mt-1">
            {task.subtasks!.map(subtask => renderTask(subtask, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={cn(
      "bg-gray-900/95 backdrop-blur-lg rounded-xl border border-gray-800",
      "shadow-2xl",
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <ListTodo className="h-5 w-5 text-purple-400" />
          <h3 className="font-semibold text-white">Workflow Tasks</h3>
          <span className="text-xs text-gray-400 ml-2">
            {completedTasks.length} of {tasks.length} completed
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-2 border-b border-gray-800">
        <button
          onClick={() => setActiveTab('all')}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
            activeTab === 'all'
              ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          )}
        >
          All
          <span className="ml-2 text-xs opacity-70">({tasks.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('active')}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
            activeTab === 'active'
              ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          )}
        >
          Active
          <span className="ml-2 text-xs opacity-70">({activeTasks.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
            activeTab === 'completed'
              ? "bg-green-500/20 text-green-400 border border-green-500/30"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          )}
        >
          Completed
          <span className="ml-2 text-xs opacity-70">({completedTasks.length})</span>
        </button>
      </div>

      {/* Task List */}
      <div className="max-h-96 overflow-y-auto custom-scrollbar">
        {filteredTasks.length > 0 ? (
          <div className="p-2">
            {filteredTasks.map(task => renderTask(task))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Sparkles className="h-8 w-8 mb-3 opacity-50" />
            <p className="text-sm">No tasks to display</p>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
          <span>Progress</span>
          <span>{Math.round((completedTasks.length / tasks.length) * 100)}%</span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-500"
            style={{ width: `${(completedTasks.length / tasks.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// Add custom scrollbar styles
const styles = `
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  
  .custom-scrollbar::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 3px;
  }
  
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
  }
  
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
  }
`;

if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}