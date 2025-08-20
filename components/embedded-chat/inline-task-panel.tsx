'use client';

import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  ListChecks} from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'active' | 'completed';
  priority?: 'low' | 'medium' | 'high';
}

interface InlineTaskPanelProps {
  tasks: Task[];
  onTaskComplete?: (taskId: string) => void;
  className?: string;
}

export function InlineTaskPanel({
  tasks,
  onTaskComplete,
  className
}: InlineTaskPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  const activeTasks = tasks.filter(t => t.status === 'active' || t.status === 'pending');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const completionRate = tasks.length > 0 ? (completedTasks.length / tasks.length) * 100 : 0;

  const getTaskIcon = (status: Task['status']) => {
    if (status === 'completed') {
      return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    }
    if (status === 'active') {
      return (
        <div className="relative">
          <Circle className="h-4 w-4 text-blue-400" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-1.5 w-1.5 bg-blue-400 rounded-full animate-pulse" />
          </div>
        </div>
      );
    }
    return <Circle className="h-4 w-4 text-gray-500 hover:text-gray-400 transition-colors" />;
  };

  return (
    <div className={cn(
      "bg-gradient-to-r from-purple-900/20 to-blue-900/20",
      "border border-purple-500/20 rounded-lg",
      "backdrop-blur-sm",
      className
    )}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-3">
          <ListChecks className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-medium text-white">
            Workflow Tasks
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">
              {completedTasks.length}/{tasks.length}
            </span>
            {/* Mini progress bar */}
            <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-400 to-blue-400 transition-all duration-500"
                style={{ width: `${completionRate}%` }}
              />
            </div>
          </div>
        </div>
        
        <ChevronDown
          className={cn(
            "h-4 w-4 text-gray-400 transition-transform duration-200",
            !isExpanded && "-rotate-180"
          )}
        />
      </button>

      {/* Task List */}
      {isExpanded && (
        <div className="px-4 pb-3 space-y-1 max-h-64 overflow-y-auto">
          {activeTasks.map(task => (
            <div
              key={task.id}
              className={cn(
                "flex items-start gap-2 py-2 px-2 rounded-lg",
                "hover:bg-white/5 transition-all duration-200 cursor-pointer group"
              )}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTaskComplete?.(task.id);
                }}
                className="mt-0.5 transition-transform duration-200 hover:scale-110"
              >
                {getTaskIcon(task.status)}
              </button>
              
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-200 leading-tight">
                  {task.title}
                </p>
                {task.description && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {task.description}
                  </p>
                )}
                {task.status === 'active' && (
                  <div className="flex items-center gap-1 mt-1">
                    <Clock className="h-3 w-3 text-blue-400" />
                    <span className="text-xs text-blue-400">In progress</span>
                  </div>
                )}
              </div>

              {task.priority === 'high' && (
                <AlertCircle className="h-3 w-3 text-red-400 mt-1" />
              )}
            </div>
          ))}

          {completedTasks.length > 0 && (
            <>
              <div className="border-t border-gray-700/50 my-2" />
              <div className="opacity-50">
                {completedTasks.slice(0, 2).map(task => (
                  <div
                    key={task.id}
                    className="flex items-start gap-2 py-1.5 px-2"
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5" />
                    <p className="text-sm text-gray-400 line-through">
                      {task.title}
                    </p>
                  </div>
                ))}
                {completedTasks.length > 2 && (
                  <p className="text-xs text-gray-500 pl-8 mt-1">
                    +{completedTasks.length - 2} more completed
                  </p>
                )}
              </div>
            </>
          )}

          {tasks.length === 0 && (
            <div className="py-4 text-center text-sm text-gray-500">
              No active tasks
            </div>
          )}
        </div>
      )}
    </div>
  );
}