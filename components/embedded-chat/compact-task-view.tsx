'use client';

import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Clock,
  ListTodo,
  Loader2,
  Sparkles,
  Target,
  Zap
} from 'lucide-react';
import { useEffect,useState } from 'react';

import { cn } from '@/lib/utils';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority?: 'low' | 'medium' | 'high';
  progress?: number;
  subtasks?: Task[];
  metadata?: {
    model?: string;
    duration?: string;
    confidence?: number;
  };
}

interface CompactTaskViewProps {
  tasks: Task[];
  workflowName?: string;
  onTaskClick?: (task: Task) => void;
  onTaskComplete?: (taskId: string) => void;
  className?: string;
  isActive?: boolean;
}

export function CompactTaskView({
  tasks,
  workflowName = 'Workflow Tasks',
  onTaskClick,
  onTaskComplete,
  className,
  isActive = false
}: CompactTaskViewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [animateProgress, setAnimateProgress] = useState(false);

  const completedTasks = tasks.filter(t => t.status === 'completed');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const currentTask = inProgressTasks[0] || pendingTasks[0];
  const progress = (completedTasks.length / tasks.length) * 100;

  useEffect(() => {
    if (inProgressTasks.length > 0) {
      setAnimateProgress(true);
      const timer = setTimeout(() => setAnimateProgress(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [inProgressTasks.length]);

  const getStatusIcon = (status: Task['status'], size: 'sm' | 'md' = 'sm') => {
    const sizeClass = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
    
    switch (status) {
      case 'completed':
        return <CheckCircle2 className={cn(sizeClass, "text-emerald-400")} />;
      case 'in_progress':
        return <Loader2 className={cn(sizeClass, "text-blue-400 animate-spin")} />;
      default:
        return <Circle className={cn(sizeClass, "text-gray-500")} />;
    }
  };

  const getTaskColor = (status: Task['status']) => {
    switch (status) {
      case 'completed':
        return 'text-emerald-400';
      case 'in_progress':
        return 'text-blue-400';
      default:
        return 'text-gray-400';
    }
  };

  // Collapsed view - single line like Manus
  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className={cn(
          "w-full px-3 py-2 rounded-lg",
          "bg-gray-800/50 hover:bg-gray-800/70",
          "border border-gray-700/50 hover:border-gray-600/50",
          "transition-all duration-200",
          "group",
          className
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isActive ? (
              <div className="relative">
                <div className="h-2 w-2 bg-blue-400 rounded-full animate-pulse" />
                <div className="absolute inset-0 h-2 w-2 bg-blue-400 rounded-full animate-ping" />
              </div>
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            )}
            
            <span className="text-sm text-gray-300 font-medium">
              {workflowName}
            </span>
            
            <span className="text-xs text-gray-500">
              {completedTasks.length} / {tasks.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Mini progress indicator */}
            <div className="flex gap-0.5">
              {tasks.slice(0, 5).map((task, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "h-1.5 w-1.5 rounded-full transition-all duration-300",
                    task.status === 'completed' 
                      ? "bg-emerald-400" 
                      : task.status === 'in_progress'
                      ? "bg-blue-400 animate-pulse"
                      : "bg-gray-600"
                  )}
                />
              ))}
              {tasks.length > 5 && (
                <span className="text-xs text-gray-500 ml-1">+{tasks.length - 5}</span>
              )}
            </div>
            
            <ChevronDown className="h-3.5 w-3.5 text-gray-400 group-hover:text-gray-300 transition-colors" />
          </div>
        </div>
      </button>
    );
  }

  // Expanded view - shows task details
  return (
    <div className={cn(
      "rounded-lg overflow-hidden",
      "bg-gray-900/50 backdrop-blur-sm",
      "border border-gray-700/50",
      "shadow-lg",
      className
    )}>
      {/* Header */}
      <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ListTodo className="h-4 w-4 text-purple-400" />
            <h3 className="text-sm font-semibold text-white">{workflowName}</h3>
            <span className="text-xs text-gray-400">
              {completedTasks.length} of {tasks.length} completed
            </span>
          </div>
          
          <button
            onClick={() => setIsExpanded(false)}
            className="p-1 hover:bg-gray-700/50 rounded transition-colors"
          >
            <ChevronUp className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full bg-gradient-to-r from-purple-500 to-blue-500",
                "transition-all duration-500 ease-out",
                animateProgress && "animate-pulse"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Current task highlight */}
      {currentTask && (
        <div className="px-4 py-3 bg-blue-500/10 border-b border-gray-700/50">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              {currentTask.status === 'in_progress' ? (
                <Zap className="h-4 w-4 text-blue-400 animate-pulse" />
              ) : (
                <Target className="h-4 w-4 text-purple-400" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm text-white font-medium">
                {currentTask.status === 'in_progress' ? 'Currently working on:' : 'Next up:'}
              </p>
              <p className="text-sm text-gray-300 mt-0.5">{currentTask.title}</p>
              {currentTask.description && (
                <p className="text-xs text-gray-500 mt-1">{currentTask.description}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Task list - scrollable */}
      <div className="max-h-64 overflow-y-auto custom-scrollbar">
        <div className="p-2 space-y-1">
          {tasks.map((task, index) => (
            <div
              key={task.id}
              className={cn(
                "px-3 py-2 rounded-md transition-all duration-200",
                "hover:bg-gray-800/30 cursor-pointer",
                task.status === 'completed' && "opacity-60"
              )}
              onClick={() => onTaskClick?.(task)}
            >
              <div className="flex items-start gap-2">
                <div className="mt-0.5">
                  {getStatusIcon(task.status)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm leading-tight",
                    task.status === 'completed' 
                      ? "text-gray-400 line-through" 
                      : "text-gray-200"
                  )}>
                    {task.title}
                  </p>
                  
                  {task.status === 'in_progress' && task.progress !== undefined && (
                    <div className="mt-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-400 transition-all duration-300"
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">{task.progress}%</span>
                      </div>
                    </div>
                  )}

                  {task.metadata && (
                    <div className="flex items-center gap-3 mt-1">
                      {task.metadata.model && (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Sparkles className="h-3 w-3" />
                          {task.metadata.model}
                        </span>
                      )}
                      {task.metadata.duration && (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {task.metadata.duration}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="text-xs text-gray-500">
                  {index + 1}/{tasks.length}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer with action hints */}
      {inProgressTasks.length > 0 && (
        <div className="px-4 py-2 bg-gray-800/30 border-t border-gray-700/50">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-1">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1.5 w-1.5 rounded-full bg-blue-400",
                    i === 1 && "animate-bounce",
                    i === 2 && "animate-bounce animation-delay-200"
                  )}
                  style={{ animationDelay: `${i * 100}ms` }}
                />
              ))}
            </div>
            <span className="text-xs text-gray-400">Processing tasks...</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Add custom scrollbar and animation styles
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    .custom-scrollbar::-webkit-scrollbar {
      width: 4px;
    }
    
    .custom-scrollbar::-webkit-scrollbar-track {
      background: transparent;
    }
    
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: rgba(156, 163, 175, 0.3);
      border-radius: 2px;
    }
    
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background: rgba(156, 163, 175, 0.5);
    }
    
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-3px); }
    }
    
    .animation-delay-200 {
      animation-delay: 200ms;
    }
  `;
  document.head.appendChild(style);
}