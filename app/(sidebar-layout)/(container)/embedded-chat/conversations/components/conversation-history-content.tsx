'use client';

import { format } from 'date-fns';
import { 
  ArrowLeft,
  Calendar as CalendarIcon,
  Download,
  Filter,
  Search, 
  Trash2,
  X} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback,useState } from 'react';

import { deleteConversations as deleteConversationsAction } from '@/app/actions/embedded-chat';
import { searchConversations } from '@/app/actions/embedded-chat-analytics';
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
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

import { RecentConversationsTable } from '../../dashboard/components/recent-conversations-table';

interface Conversation {
  uuid: string;
  visitor_id: string;
  visitor_name?: string;
  visitor_email?: string;
  started_at: Date;
  ended_at?: Date;
  status: 'active' | 'waiting' | 'human_controlled' | 'ended';
  message_count: number;
  page_url?: string;
}

interface ConversationHistoryContentProps {
  chatUuid: string;
  initialConversations: Conversation[];
}

export function ConversationHistoryContent({ 
  chatUuid, 
  initialConversations 
}: ConversationHistoryContentProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [conversations, setConversations] = useState(initialConversations);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({ from: undefined, to: undefined });
  const [isSearching, setIsSearching] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedConversations, setSelectedConversations] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSearch = useCallback(async () => {
    setIsSearching(true);
    try {
      const result = await searchConversations(chatUuid, searchQuery, {
        status: statusFilter !== 'all' ? statusFilter : undefined,
        startDate: dateRange.from,
        endDate: dateRange.to,
      });

      if (result.success && result.data) {
        // Transform data to match the expected type
        const transformedData = result.data.map((conv: any) => ({
          ...conv,
          visitor_name: conv.visitor_name || undefined,
          visitor_email: conv.visitor_email || undefined,
          ended_at: conv.ended_at || undefined,
          page_url: conv.page_url || undefined,
          status: conv.status || 'ended',
        }));
        setConversations(transformedData);
      }
    } finally {
      setIsSearching(false);
    }
  }, [chatUuid, searchQuery, statusFilter, dateRange]);

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setDateRange({ from: undefined, to: undefined });
    setConversations(initialConversations);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedConversations(new Set(conversations.map(c => c.uuid)));
    } else {
      setSelectedConversations(new Set());
    }
  };

  const handleSelectConversation = (uuid: string, checked: boolean) => {
    const newSelected = new Set(selectedConversations);
    if (checked) {
      newSelected.add(uuid);
    } else {
      newSelected.delete(uuid);
    }
    setSelectedConversations(newSelected);
  };

  const handleDeleteSelected = async () => {
    if (selectedConversations.size === 0) return;
    
    setIsDeleting(true);
    try {
      const result = await deleteConversationsAction(Array.from(selectedConversations));
      
      if (result.success) {
        toast({
          title: 'Success',
          description: `Deleted ${result.deletedCount} conversation${result.deletedCount !== 1 ? 's' : ''}`,
        });
        
        // Remove deleted conversations from the list
        setConversations(conversations.filter(c => !selectedConversations.has(c.uuid)));
        setSelectedConversations(new Set());
        
        // Refresh the page to get updated data
        router.refresh();
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to delete conversations',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const exportConversations = () => {
    // Create CSV export
    const headers = ['Visitor', 'Email', 'Started', 'Ended', 'Status', 'Messages', 'Page URL'];
    const rows = conversations.map(conv => [
      conv.visitor_name || conv.visitor_id,
      conv.visitor_email || '',
      new Date(conv.started_at).toISOString(),
      conv.ended_at ? new Date(conv.ended_at).toISOString() : '',
      conv.status,
      conv.message_count,
      conv.page_url || ''
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversations-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Back Button and Actions */}
      <div className="flex justify-between items-center">
        <Link href="/embedded-chat/dashboard">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
        <div className="flex gap-2">
          {selectedConversations.size > 0 && (
            <>
              <span className="flex items-center text-sm text-muted-foreground mr-2">
                {selectedConversations.size} selected
              </span>
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={() => setShowDeleteDialog(true)}
                disabled={isDeleting}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Selected
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={exportConversations}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Search & Filters</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-4 w-4 mr-2" />
              {showFilters ? 'Hide' : 'Show'} Filters
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search by visitor name, email, or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-10"
                />
              </div>
              <Button onClick={handleSearch} disabled={isSearching}>
                {isSearching ? 'Searching...' : 'Search'}
              </Button>
            </div>

            {/* Filters */}
            {showFilters && (
              <div className="grid gap-4 md:grid-cols-3 pt-4 border-t">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="waiting">Waiting</SelectItem>
                      <SelectItem value="human_controlled">Human Controlled</SelectItem>
                      <SelectItem value="ended">Ended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !dateRange.from && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange.from ? format(dateRange.from, 'PPP') : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={dateRange.from}
                        onSelect={(date) => setDateRange({ ...dateRange, from: date })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !dateRange.to && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange.to ? format(dateRange.to, 'PPP') : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={dateRange.to}
                        onSelect={(date) => setDateRange({ ...dateRange, to: date })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}

            {/* Active Filters */}
            {(searchQuery || statusFilter !== 'all' || dateRange.from || dateRange.to) && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">Active filters:</span>
                {searchQuery && (
                  <div className="bg-muted px-2 py-1 rounded-md text-sm flex items-center gap-1">
                    Search: {searchQuery}
                    <X 
                      className="h-3 w-3 cursor-pointer" 
                      onClick={() => setSearchQuery('')}
                    />
                  </div>
                )}
                {statusFilter !== 'all' && (
                  <div className="bg-muted px-2 py-1 rounded-md text-sm flex items-center gap-1">
                    Status: {statusFilter}
                    <X 
                      className="h-3 w-3 cursor-pointer" 
                      onClick={() => setStatusFilter('all')}
                    />
                  </div>
                )}
                {dateRange.from && (
                  <div className="bg-muted px-2 py-1 rounded-md text-sm flex items-center gap-1">
                    From: {format(dateRange.from, 'PP')}
                    <X 
                      className="h-3 w-3 cursor-pointer" 
                      onClick={() => setDateRange({ ...dateRange, from: undefined })}
                    />
                  </div>
                )}
                {dateRange.to && (
                  <div className="bg-muted px-2 py-1 rounded-md text-sm flex items-center gap-1">
                    To: {format(dateRange.to, 'PP')}
                    <X 
                      className="h-3 w-3 cursor-pointer" 
                      onClick={() => setDateRange({ ...dateRange, to: undefined })}
                    />
                  </div>
                )}
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear All
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Conversations Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Conversations ({conversations.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RecentConversationsTable 
            conversations={conversations}
            chatUuid={chatUuid}
            showAll
            selectedConversations={selectedConversations}
            onSelectConversation={handleSelectConversation}
            onSelectAll={handleSelectAll}
          />
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Conversations</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedConversations.size} conversation{selectedConversations.size !== 1 ? 's' : ''}?
              This will permanently delete:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>All messages in the conversation{selectedConversations.size !== 1 ? 's' : ''}</li>
                <li>All associated memories and context</li>
                <li>All workflows and tasks</li>
                <li>All monitoring and analytics data</li>
              </ul>
              <span className="font-semibold text-destructive mt-2 block">This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSelected}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}