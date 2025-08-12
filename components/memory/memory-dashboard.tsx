'use client';

import { useState, useEffect } from 'react';
import { BarChart3, Brain, Clock, Filter, RefreshCw, Search, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { MemoryCard } from './memory-card';
import { StoredMemory } from '@/lib/chat-memory/memory-store';

// Helper to ensure absolute URLs for API calls
function getApiUrl(path: string) {
  // In production, use the origin. In development, ensure we use the correct base URL
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${path}`;
  }
  return path;
}

interface Memory {
  id: string;
  conversation_id: string;
  kind: string;
  value_jsonb: any;
  salience: number;
  novelty_hash: string;
  created_at: string;
  last_used_at: string;
}

// Convert database memory to StoredMemory format
function convertToStoredMemory(memory: Memory): StoredMemory {
  return {
    id: memory.id,
    content: memory.value_jsonb?.content || '',
    factType: memory.value_jsonb?.factType || memory.kind || 'unknown',
    importance: memory.value_jsonb?.importance || 5,
    confidence: memory.value_jsonb?.confidence || 0.8,
    salience: memory.salience || 0,
    hash: memory.novelty_hash || '',
    metadata: memory.value_jsonb || {},
    createdAt: new Date(memory.created_at),
    lastAccessedAt: memory.last_used_at ? new Date(memory.last_used_at) : new Date(memory.created_at)
  };
}

interface MemoryStats {
  totalMemories: number;
  memoriesByType: Record<string, number>;
  memoriesByDay: Record<string, number>;
  averageSalience: number;
  mostUsedMemories: Memory[];
  recentMemories: Memory[];
}

interface MemoryDashboardProps {
  chatUuid: string;
  conversationId: string;
  className?: string;
}

export function MemoryDashboard({ chatUuid, conversationId, className }: MemoryDashboardProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Fetch memories and calculate stats
  useEffect(() => {
    const fetchMemories = async () => {
      setLoading(true);
      try {
        const response = await fetch(getApiUrl(`/api/embedded-chat/${chatUuid}/conversations/${conversationId}/memories`));
        if (response.ok) {
          const data = await response.json();
          const memoriesData = data.memories || [];
          setMemories(memoriesData);
          calculateStats(memoriesData);
        }
      } catch (error) {
        console.error('Error fetching memories:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMemories();
  }, [chatUuid, conversationId]);

  // Calculate statistics
  const calculateStats = (memoriesData: Memory[]) => {
    const memoriesByType: Record<string, number> = {};
    const memoriesByDay: Record<string, number> = {};
    let totalSalience = 0;
    
    memoriesData.forEach(memory => {
      // Count by type
      const type = memory.kind || 'unknown';
      memoriesByType[type] = (memoriesByType[type] || 0) + 1;
      
      // Count by day
      const date = new Date(memory.created_at).toLocaleDateString();
      memoriesByDay[date] = (memoriesByDay[date] || 0) + 1;
      
      // Sum salience
      totalSalience += memory.salience || 0;
    });
    
    // Sort memories by usage and recency
    const mostUsedMemories = [...memoriesData]
      .sort((a, b) => (b.last_used_at ? new Date(b.last_used_at).getTime() : 0) - (a.last_used_at ? new Date(a.last_used_at).getTime() : 0))
      .slice(0, 5);
      
    const recentMemories = [...memoriesData]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
    
    setStats({
      totalMemories: memoriesData.length,
      memoriesByType,
      memoriesByDay,
      averageSalience: memoriesData.length > 0 ? totalSalience / memoriesData.length : 0,
      mostUsedMemories,
      recentMemories,
    });
  };

  // Filter and sort memories
  const filteredMemories = memories
    .filter(memory => {
      const matchesSearch = searchTerm === '' || 
        JSON.stringify(memory.value_jsonb).toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'all' || memory.kind === filterType;
      return matchesSearch && matchesType;
    })
    .sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortBy) {
        case 'created_at':
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
          break;
        case 'last_used_at':
          aValue = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
          bValue = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
          break;
        case 'salience':
          aValue = a.salience || 0;
          bValue = b.salience || 0;
          break;
        default:
          aValue = a.created_at;
          bValue = b.created_at;
      }
      
      return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
    });

  // Get unique memory types for filter
  const memoryTypes = Array.from(new Set(memories.map(m => m.kind).filter(Boolean)));

  // Get type color
  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      'fact': 'bg-blue-100 text-blue-800',
      'preference': 'bg-green-100 text-green-800',
      'personal_info': 'bg-purple-100 text-purple-800',
      'context': 'bg-yellow-100 text-yellow-800',
      'instruction': 'bg-red-100 text-red-800',
      'unknown': 'bg-gray-100 text-gray-800',
    };
    return colors[type] || colors.unknown;
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        <span>Loading memory dashboard...</span>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6" />
            Memory Dashboard
          </h2>
          <p className="text-gray-600">Analytics and insights for conversation memories</p>
        </div>
        <Button
          variant="outline"
          onClick={() => window.location.reload()}
          className="flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Memories</CardTitle>
              <Brain className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalMemories}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Memory Types</CardTitle>
              <Filter className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Object.keys(stats.memoriesByType).length}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg. Salience</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.averageSalience.toFixed(2)}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Last Activity</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-sm font-medium">
                {memories.length > 0 
                  ? new Date(Math.max(...memories.map(m => new Date(m.created_at).getTime()))).toLocaleDateString()
                  : 'No activity'
                }
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="memories">All Memories</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {stats && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Memory Types Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle>Memory Types</CardTitle>
                  <CardDescription>Distribution of memories by type</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(stats.memoriesByType).map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge className={getTypeColor(type)}>{type}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600">{count}</span>
                          <div className="w-24 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full" 
                              style={{ width: `${(count / stats.totalMemories) * 100}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Recent Memories */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Memories</CardTitle>
                  <CardDescription>Most recently created memories</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {stats.recentMemories.length > 0 ? (
                      stats.recentMemories.map(memory => (
                        <div key={memory.id} className="p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center justify-between mb-1">
                            <Badge className={getTypeColor(memory.kind)}>{memory.kind}</Badge>
                            <span className="text-xs text-gray-500">
                              {new Date(memory.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 line-clamp-2">
                            {memory.value_jsonb?.fact || memory.value_jsonb?.content || 'No content'}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500">No memories found</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Most Used Memories */}
              <Card>
                <CardHeader>
                  <CardTitle>Most Used Memories</CardTitle>
                  <CardDescription>Memories with most recent usage</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {stats.mostUsedMemories.length > 0 ? (
                      stats.mostUsedMemories.map(memory => (
                        <div key={memory.id} className="p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center justify-between mb-1">
                            <Badge className={getTypeColor(memory.kind)}>{memory.kind}</Badge>
                            <span className="text-xs text-gray-500">
                              {memory.last_used_at 
                                ? new Date(memory.last_used_at).toLocaleDateString()
                                : 'Never used'
                              }
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 line-clamp-2">
                            {memory.value_jsonb?.fact || memory.value_jsonb?.content || 'No content'}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500">No memories found</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Memory Activity */}
              <Card>
                <CardHeader>
                  <CardTitle>Memory Activity</CardTitle>
                  <CardDescription>Memory creation over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(stats.memoriesByDay)
                      .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
                      .slice(0, 7)
                      .map(([date, count]) => (
                        <div key={date} className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">{date}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">{count}</span>
                            <div className="w-24 bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-green-600 h-2 rounded-full" 
                                style={{ width: `${(count / Math.max(...Object.values(stats.memoriesByDay))) * 100}%` }}
                              ></div>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="memories" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search memories..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Filter by type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {memoryTypes.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created_at">Created Date</SelectItem>
                    <SelectItem value="last_used_at">Last Used</SelectItem>
                    <SelectItem value="salience">Salience</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortOrder} onValueChange={(value: 'asc' | 'desc') => setSortOrder(value)}>
                  <SelectTrigger className="w-full sm:w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Descending</SelectItem>
                    <SelectItem value="asc">Ascending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Memory List */}
          <div className="grid grid-cols-1 gap-4">
            {filteredMemories.length > 0 ? (
              filteredMemories.map(memory => (
                <MemoryCard
                  key={memory.id}
                  memory={convertToStoredMemory(memory)}
                  className="w-full"
                />
              ))
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-8">
                    <Brain className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No memories found</h3>
                    <p className="text-gray-500">
                      {searchTerm || filterType !== 'all' 
                        ? 'Try adjusting your filters or search terms.'
                        : 'No memories have been created for this conversation yet.'
                      }
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Memory Analytics</CardTitle>
              <CardDescription>Detailed analysis of memory usage and patterns</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Advanced Analytics</h3>
                <p className="text-gray-500">
                  Detailed analytics charts and visualizations will be implemented in a future update.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}