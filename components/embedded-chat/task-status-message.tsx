'use client';

import { AlertCircle, CheckCircle, Clock, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

interface TaskStatusMessageProps {
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  taskName: string;
  progress?: { current: number; total: number };
  className?: string;
}

export function TaskStatusMessage({ 
  status, 
  taskName, 
  progress,
  className 
}: TaskStatusMessageProps) {
  const getStatusIcon = () => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'in_progress':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'completed':
        return `✅ ${taskName} completed successfully`;
      case 'in_progress':
        return `⏳ ${taskName} in progress${progress ? ` (${progress.current}/${progress.total})` : ''}`;
      case 'failed':
        return `❌ ${taskName} failed - manual action required`;
      default:
        return `📋 ${taskName} task created - pending execution`;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      case 'in_progress':
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
      case 'failed':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      default:
        return 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800';
    }
  };

  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-2 rounded-lg border',
      getStatusColor(),
      className
    )}>
      {getStatusIcon()}
      <span className="text-sm font-medium">
        {getStatusText()}
      </span>
    </div>
  );
}