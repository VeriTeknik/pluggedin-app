'use client';

import { 
  Brain,
  Database,
  RefreshCw,
  Search,
  Trash2,
  User,
  MessageSquare,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { EmbeddedChat } from '@/types/embedded-chat';

interface Memory {
  id: string;
  kind: 'profile' | 'preference' | 'fact' | 'id' | 'snippet';
  content?: string;
  factType?: string;
  importance?: number;
  confidence?: number;
  source: 'user' | 'assistant_tool' | 'system';
  conversation_id?: string;
  owner_id: string;
  created_at: string;
  last_used_at?: string;
  metadata?: any;
}

interface MemoryTabProps {
  chat: EmbeddedChat;
  chatUuid: string;
}

export function MemoryTab({ chat, chatUuid }: MemoryTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [memoryType, setMemoryType] = useState<'all' | 'conversation' | 'user'>('all');
  const [selectedMemories, setSelectedMemories] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showClearAllDialog, setShowClearAllDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load memories on mount
  useEffect(() => {
    loadMemories();
  }, [chatUuid, memoryType]);

  const loadMemories = async () => {
    setIsLoading(true);
    try {
      // This would typically be an API call to fetch memories
      // For now, we'll use a placeholder
      const response = await fetch(`/api/embedded-chat/${chatUuid}/memories?type=${memoryType}`);
      if (response.ok) {
        const data = await response.json();
        setMemories(data.memories || []);
      }
    } catch (error) {
      console.error('Error loading memories:', error);
      toast({
        title: t('common.error'),
        description: 'Failed to load memories',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const deleteMemory = async (memoryId: string) => {
    try {
      const response = await fetch(
        `/api/embedded-chat/${chatUuid}/memories?id=${memoryId}`,
        { method: 'DELETE' }
      );
      
      if (response.ok) {
        setMemories(memories.filter(m => m.id !== memoryId));
        toast({
          title: t('common.success'),
          description: 'Memory deleted successfully',
        });
      } else {
        throw new Error('Failed to delete memory');
      }
    } catch (error) {
      console.error('Error deleting memory:', error);
      toast({
        title: t('common.error'),
        description: 'Failed to delete memory',
        variant: 'destructive',
      });
    }
  };

  const deleteSelectedMemories = async () => {
    setIsDeleting(true);
    try {
      // Delete each selected memory
      const deletePromises = Array.from(selectedMemories).map(id => 
        fetch(`/api/embedded-chat/${chatUuid}/memories?id=${id}`, { method: 'DELETE' })
      );
      
      await Promise.all(deletePromises);
      
      setMemories(memories.filter(m => !selectedMemories.has(m.id)));
      setSelectedMemories(new Set());
      toast({
        title: t('common.success'),
        description: `Deleted ${selectedMemories.size} memories`,
      });
    } catch (error) {
      console.error('Error deleting memories:', error);
      toast({
        title: t('common.error'),
        description: 'Failed to delete some memories',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const clearAllMemories = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(
        `/api/embedded-chat/${chatUuid}/memories/clear-all`,
        { method: 'DELETE' }
      );
      
      if (response.ok) {
        setMemories([]);
        toast({
          title: t('common.success'),
          description: 'All memories cleared successfully',
        });
      } else {
        throw new Error('Failed to clear memories');
      }
    } catch (error) {
      console.error('Error clearing memories:', error);
      toast({
        title: t('common.error'),
        description: 'Failed to clear memories',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setShowClearAllDialog(false);
    }
  };

  const getMemoryIcon = (source: string) => {
    switch (source) {
      case 'user':
        return <User className="h-4 w-4" />;
      case 'assistant_tool':
        return <Brain className="h-4 w-4" />;
      case 'system':
        return <Database className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getMemoryTypeColor = (kind: string) => {
    switch (kind) {
      case 'profile':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'preference':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'fact':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'id':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
      case 'snippet':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  const filteredMemories = memories.filter(memory => {
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      return (
        memory.content?.toLowerCase().includes(searchLower) ||
        memory.factType?.toLowerCase().includes(searchLower) ||
        JSON.stringify(memory.metadata).toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5" />
          {t('embeddedChat.memory.title', 'Memory Management')}
        </CardTitle>
        <CardDescription>
          {t('embeddedChat.memory.description', 'View and manage conversation and user memories')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder={t('embeddedChat.memory.searchPlaceholder', 'Search memories...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Select value={memoryType} onValueChange={(value: any) => setMemoryType(value)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Memory type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Memories</SelectItem>
              <SelectItem value="conversation">Conversation</SelectItem>
              <SelectItem value="user">User</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={loadMemories}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {t('common.refresh', 'Refresh')}
          </Button>
        </div>

        {/* Action Buttons - Only show in debug mode */}
        {chat.debug_mode && (
          <div className="flex gap-2">
            {selectedMemories.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
                disabled={isDeleting}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Selected ({selectedMemories.size})
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowClearAllDialog(true)}
              disabled={isDeleting || memories.length === 0}
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Clear All Memories
            </Button>
          </div>
        )}

        {/* Memory Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{memories.length}</div>
              <p className="text-xs text-muted-foreground">Total Memories</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {memories.filter(m => m.conversation_id).length}
              </div>
              <p className="text-xs text-muted-foreground">Conversation</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {memories.filter(m => !m.conversation_id).length}
              </div>
              <p className="text-xs text-muted-foreground">User Level</p>
            </CardContent>
          </Card>
        </div>

        {/* Memory List */}
        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredMemories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Brain className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>{t('embeddedChat.memory.noMemories', 'No memories found')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMemories.map((memory) => (
                <Card key={memory.id} className="p-3">
                  <div className="flex items-start gap-3">
                    {chat.debug_mode && (
                      <input
                        type="checkbox"
                        checked={selectedMemories.has(memory.id)}
                        onChange={(e) => {
                          const newSelected = new Set(selectedMemories);
                          if (e.target.checked) {
                            newSelected.add(memory.id);
                          } else {
                            newSelected.delete(memory.id);
                          }
                          setSelectedMemories(newSelected);
                        }}
                        className="mt-1"
                      />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {getMemoryIcon(memory.source)}
                        <Badge variant="outline" className={getMemoryTypeColor(memory.kind)}>
                          {memory.kind}
                        </Badge>
                        {memory.factType && (
                          <Badge variant="outline">{memory.factType}</Badge>
                        )}
                        {memory.conversation_id ? (
                          <Badge variant="outline">Conversation</Badge>
                        ) : (
                          <Badge variant="outline">User</Badge>
                        )}
                      </div>
                      <p className="text-sm">{memory.content || JSON.stringify(memory.metadata)}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        {memory.importance && (
                          <span>Importance: {memory.importance}/10</span>
                        )}
                        {memory.confidence && (
                          <span>Confidence: {(memory.confidence * 100).toFixed(0)}%</span>
                        )}
                        <span>Created: {new Date(memory.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    {chat.debug_mode && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMemory(memory.id)}
                        className="h-8 w-8 p-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Delete Selected Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Selected Memories</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete {selectedMemories.size} selected memories?
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={deleteSelectedMemories}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Clear All Dialog */}
        <AlertDialog open={showClearAllDialog} onOpenChange={setShowClearAllDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear All Memories</AlertDialogTitle>
              <AlertDialogDescription>
                <div className="space-y-2">
                  <p>This will permanently delete ALL memories including:</p>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>User profile information</li>
                    <li>Preferences and settings</li>
                    <li>Conversation context</li>
                    <li>Learned facts and patterns</li>
                  </ul>
                  <p className="font-semibold text-destructive mt-2">
                    This action cannot be undone and will reset the AI's knowledge about all users.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={clearAllMemories}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? 'Clearing...' : 'Clear All'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}