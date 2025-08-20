'use client';

import { Brain, Calendar, Clock, Copy,Edit, Hash, MoreVertical, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { StoredMemory } from '@/lib/chat-memory/memory-store';
import { cn } from '@/lib/utils';

interface MemoryCardProps {
  memory: StoredMemory;
  className?: string;
  onDelete?: (memoryId: string) => void;
  onEdit?: (memoryId: string, content: string) => void;
  showActions?: boolean;
}

const getFactTypeColor = (factType: string) => {
  switch (factType) {
    case 'personal_info':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'preference':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'relationship':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    case 'work_info':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
    case 'technical_detail':
      return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200';
    case 'event':
      return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200';
    case 'goal':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200';
    case 'problem':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'solution':
      return 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200';
    case 'context':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
};

const getImportanceColor = (importance: number) => {
  if (importance >= 8) return 'text-red-500';
  if (importance >= 6) return 'text-orange-500';
  if (importance >= 4) return 'text-yellow-500';
  return 'text-green-500';
};

const formatDate = (date: Date) => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

export function MemoryCard({ 
  memory, 
  className, 
  onDelete, 
  onEdit,
  showActions = true 
}: MemoryCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(memory.content);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(memory.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const handleEdit = () => {
    if (onEdit) {
      onEdit(memory.id, editContent);
      setIsEditing(false);
    }
  };

  const handleDelete = () => {
    if (onDelete) {
      setIsDeleting(true);
      onDelete(memory.id);
    }
  };

  return (
    <Card className={cn('w-full transition-all hover:shadow-md', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2">
            <Brain className="h-4 w-4 text-purple-500" />
            <CardTitle className="text-sm font-medium">
              Memory
            </CardTitle>
            <Badge variant="outline" className={getFactTypeColor(memory.factType)}>
              {memory.factType.replace('_', ' ')}
            </Badge>
          </div>
          
          {showActions && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleCopy}>
                  <Copy className="mr-2 h-4 w-4" />
                  {copied ? 'Copied!' : 'Copy'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsEditing(true)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={handleDelete}
                  className="text-red-600 focus:text-red-600"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        
        <div className="flex items-center space-x-4 text-xs text-muted-foreground">
          <div className="flex items-center space-x-1">
            <Calendar className="h-3 w-3" />
            <span>{formatDate(memory.createdAt)}</span>
          </div>
          <div className="flex items-center space-x-1">
            <Clock className="h-3 w-3" />
            <span>{formatDate(memory.lastAccessedAt)}</span>
          </div>
          <div className="flex items-center space-x-1">
            <span>Importance:</span>
            <span className={cn('font-medium', getImportanceColor(memory.importance))}>
              {memory.importance}/10
            </span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <CardDescription className="text-sm leading-relaxed whitespace-pre-wrap">
          {memory.content}
        </CardDescription>
        
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Hash className="h-3 w-3 text-gray-400" />
            <span className="text-xs font-mono text-gray-500">
              {memory.hash.substring(0, 8)}...
            </span>
          </div>
          
          <div className="flex items-center space-x-2 text-xs text-muted-foreground">
            <span>Confidence: {Math.round(memory.confidence * 100)}%</span>
            <span>•</span>
            <span>Salience: {memory.salience.toFixed(2)}</span>
          </div>
        </div>
      </CardContent>
      
      {/* Edit Dialog */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Memory</DialogTitle>
            <DialogDescription>
              Make changes to the memory content below.
            </DialogDescription>
          </DialogHeader>
          
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="min-h-[100px] resize-none"
            placeholder="Memory content..."
          />
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleting} onOpenChange={setIsDeleting}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Memory</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this memory? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {memory.content}
            </p>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleting(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDelete}
            >
              Delete Memory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}