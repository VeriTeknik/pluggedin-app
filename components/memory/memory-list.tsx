'use client';

import { useState, useEffect } from 'react';
import { Brain, RefreshCw, Search, Filter, SortAsc, SortDesc } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StoredMemory } from '@/lib/chat-memory/memory-store';
import { MemoryCard } from './memory-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MemoryListProps {
  memories: StoredMemory[];
  className?: string;
  onMemoryDelete?: (memoryId: string) => void;
  onMemoryEdit?: (memoryId: string, content: string) => void;
  isLoading?: boolean;
  emptyMessage?: string;
}

type SortOption = 'createdAt' | 'lastAccessedAt' | 'importance' | 'salience' | 'confidence';
type SortDirection = 'asc' | 'desc';
type FilterOption = 'all' | 'personal_info' | 'preference' | 'relationship' | 'work_info' | 'technical_detail' | 'event' | 'goal' | 'problem' | 'solution' | 'context' | 'other';

const factTypeLabels: Record<string, string> = {
  personal_info: 'Personal Info',
  preference: 'Preference',
  relationship: 'Relationship',
  work_info: 'Work Info',
  technical_detail: 'Technical',
  event: 'Event',
  goal: 'Goal',
  problem: 'Problem',
  solution: 'Solution',
  context: 'Context',
  other: 'Other'
};

export function MemoryList({ 
  memories, 
  className, 
  onMemoryDelete, 
  onMemoryEdit,
  isLoading = false,
  emptyMessage = 'No memories found.'
}: MemoryListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('lastAccessedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [filteredMemories, setFilteredMemories] = useState<StoredMemory[]>(memories);

  // Filter and sort memories
  useEffect(() => {
    let result = [...memories];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(memory => 
        memory.content.toLowerCase().includes(query) ||
        memory.factType.toLowerCase().includes(query)
      );
    }

    // Apply fact type filter
    if (filterBy !== 'all') {
      result = result.filter(memory => memory.factType === filterBy);
    }

    // Apply sorting
    result.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];
      
      // Handle date comparison
      if (sortBy === 'createdAt' || sortBy === 'lastAccessedAt') {
        aValue = new Date(aValue as Date).getTime();
        bValue = new Date(bValue as Date).getTime();
      }
      
      if (sortDirection === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

    setFilteredMemories(result);
  }, [memories, searchQuery, sortBy, sortDirection, filterBy]);

  const handleSort = (option: SortOption) => {
    if (sortBy === option) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(option);
      setSortDirection('desc');
    }
  };

  const getSortLabel = (option: SortOption) => {
    switch (option) {
      case 'createdAt': return 'Created Date';
      case 'lastAccessedAt': return 'Last Accessed';
      case 'importance': return 'Importance';
      case 'salience': return 'Salience';
      case 'confidence': return 'Confidence';
      default: return option;
    }
  };

  const factTypeCounts = memories.reduce((acc, memory) => {
    acc[memory.factType] = (acc[memory.factType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className={cn('w-full space-y-4', className)}>
      {/* Search and Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search memories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full sm:w-auto">
              <Filter className="h-4 w-4 mr-2" />
              Filter: {filterBy === 'all' ? 'All Types' : factTypeLabels[filterBy]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => setFilterBy('all')}>
              All Types ({memories.length})
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {Object.entries(factTypeCounts).map(([type, count]) => (
              <DropdownMenuItem 
                key={type} 
                onClick={() => setFilterBy(type as FilterOption)}
              >
                <div className="flex items-center justify-between w-full">
                  <span>{factTypeLabels[type]}</span>
                  <Badge variant="secondary" className="ml-2">
                    {count}
                  </Badge>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full sm:w-auto">
              {sortDirection === 'asc' ? <SortAsc className="h-4 w-4 mr-2" /> : <SortDesc className="h-4 w-4 mr-2" />}
              Sort: {getSortLabel(sortBy)}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleSort('lastAccessedAt')}>
              Last Accessed
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSort('createdAt')}>
              Created Date
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSort('importance')}>
              Importance
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSort('salience')}>
              Salience
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSort('confidence')}>
              Confidence
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Memory Count and Loading State */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Brain className="h-4 w-4 text-purple-500" />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {filteredMemories.length} of {memories.length} memories
            {filterBy !== 'all' && ` (${factTypeLabels[filterBy]})`}
            {searchQuery && ` matching "${searchQuery}"`}
          </span>
        </div>
        
        {isLoading && (
          <div className="flex items-center space-x-2">
            <RefreshCw className="h-4 w-4 animate-spin text-gray-400" />
            <span className="text-sm text-gray-500">Loading...</span>
          </div>
        )}
      </div>

      {/* Memory List */}
      {filteredMemories.length === 0 ? (
        <div className="text-center py-12">
          <Brain className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">{emptyMessage}</p>
        </div>
      ) : (
        <ScrollArea className="h-[600px] w-full">
          <div className="space-y-4">
            {filteredMemories.map((memory) => (
              <MemoryCard
                key={memory.id}
                memory={memory}
                onDelete={onMemoryDelete}
                onEdit={onMemoryEdit}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}