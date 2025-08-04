'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Search, 
  Filter,
  Download,
  Calendar as CalendarIcon,
  X,
  ArrowLeft
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { RecentConversationsTable } from '../../dashboard/components/recent-conversations-table';
import { searchConversations } from '@/app/actions/embedded-chat-analytics';
import { useRouter } from 'next/navigation';

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
  const [conversations, setConversations] = useState(initialConversations);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({ from: undefined, to: undefined });
  const [isSearching, setIsSearching] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

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
        <Button variant="outline" size="sm" onClick={exportConversations}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
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
          />
        </CardContent>
      </Card>
    </div>
  );
}