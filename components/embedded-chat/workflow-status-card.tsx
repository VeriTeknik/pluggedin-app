'use client';

import { AlertTriangle,Calendar, CheckSquare, Clock, Users } from 'lucide-react';

import { cn } from '@/lib/utils';

interface WorkflowTask {
  id: string;
  title: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  timestamp?: string;
}

interface WorkflowStatusCardProps {
  type: 'meeting' | 'task' | 'reminder';
  title: string;
  details?: {
    date?: string;
    time?: string;
    attendees?: string[];
    location?: string;
  };
  tasks: WorkflowTask[];
  className?: string;
}

export function WorkflowStatusCard({
  type,
  title,
  details,
  tasks,
  className
}: WorkflowStatusCardProps) {
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const totalTasks = tasks.length;
  const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
  
  const getIcon = () => {
    switch (type) {
      case 'meeting':
        return <Calendar className="w-5 h-5 text-blue-500" />;
      case 'task':
        return <CheckSquare className="w-5 h-5 text-purple-500" />;
      default:
        return <Clock className="w-5 h-5 text-orange-500" />;
    }
  };

  const allTasksComplete = completedTasks === totalTasks;
  const hasFailedTasks = tasks.some(t => t.status === 'failed');

  return (
    <div className={cn(
      'border rounded-lg p-4 bg-white dark:bg-gray-800 shadow-sm',
      className
    )}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3">
          {getIcon()}
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white">
              {title}
            </h4>
            {details && (
              <div className="mt-1 space-y-1">
                {details.date && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    📅 {details.date} {details.time && `at ${details.time}`}
                  </p>
                )}
                {details.attendees && details.attendees.length > 0 && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    <Users className="inline w-3 h-3 mr-1" />
                    {details.attendees.join(', ')}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* Status Badge */}
        <div className={cn(
          'px-2 py-1 rounded-full text-xs font-medium',
          allTasksComplete 
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : hasFailedTasks
            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
        )}>
          {allTasksComplete ? 'Completed' : hasFailedTasks ? 'Action Required' : 'In Progress'}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
          <span>Progress</span>
          <span>{completedTasks} of {totalTasks} steps</span>
        </div>
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div 
            className={cn(
              'h-full transition-all duration-500',
              hasFailedTasks 
                ? 'bg-red-500'
                : progress === 100 
                ? 'bg-green-500' 
                : 'bg-blue-500'
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Task List */}
      <div className="space-y-1">
        {tasks.map((task, index) => (
          <div key={task.id} className="flex items-center gap-2 text-sm">
            {task.status === 'completed' ? (
              <CheckSquare className="w-4 h-4 text-green-500 flex-shrink-0" />
            ) : task.status === 'active' ? (
              <div className="w-4 h-4 border-2 border-blue-500 rounded flex-shrink-0 animate-pulse" />
            ) : task.status === 'failed' ? (
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
            ) : (
              <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 rounded flex-shrink-0" />
            )}
            <span className={cn(
              task.status === 'completed' && 'text-gray-500 line-through',
              task.status === 'active' && 'text-blue-600 dark:text-blue-400 font-medium',
              task.status === 'failed' && 'text-red-600 dark:text-red-400'
            )}>
              {task.title}
            </span>
            {task.timestamp && (
              <span className="text-xs text-gray-400 ml-auto">
                {task.timestamp}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Action Required Notice */}
      {!allTasksComplete && (
        <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <p className="text-xs text-yellow-700 dark:text-yellow-400 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {hasFailedTasks 
              ? 'Manual action required to complete this workflow'
              : 'This workflow is being processed. Some actions may require manual confirmation in your calendar app.'}
          </p>
        </div>
      )}
    </div>
  );
}