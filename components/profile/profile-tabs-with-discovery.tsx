'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Bot, 
  MapPin, 
  Globe, 
  Clock, 
  Briefcase,
  DollarSign,
  Filter,
  Search,
  X,
  MessageSquare,
  Building2,
  Target,
  Sparkles
} from 'lucide-react';

import { AssistantCard } from '@/components/profile/assistant-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';

const CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  { value: 'technology', label: 'Technology' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'education', label: 'Education' },
  { value: 'finance', label: 'Finance' },
  { value: 'retail', label: 'Retail' },
  { value: 'legal', label: 'Legal' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'other', label: 'Other' },
];

const LANGUAGES = [
  { value: 'all', label: 'All Languages' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'zh', label: 'Chinese' },
  { value: 'hi', label: 'Hindi' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'ja', label: 'Japanese' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'tr', label: 'Turkish' },
  { value: 'nl', label: 'Dutch' },
];

const RESPONSE_TIMES = [
  { value: 'all', label: 'Any Response Time' },
  { value: 'instant', label: 'Instant' },
  { value: '1-5min', label: 'Within 5 minutes' },
  { value: '15-30min', label: 'Within 30 minutes' },
  { value: '1-2hours', label: 'Within 2 hours' },
  { value: '24hours', label: 'Within 24 hours' },
];

const PRICING_MODELS = [
  { value: 'all', label: 'All Pricing' },
  { value: 'free', label: 'Free' },
  { value: 'freemium', label: 'Freemium' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'enterprise', label: 'Enterprise' },
];

interface ProfileTabsProps {
  isOwner: boolean;
  username: string;
  embeddedChats: any[];
  aiAssistantsDescription?: string | null;
}

export function ProfileTabsWithDiscovery({ 
  username,
  isOwner,
  embeddedChats,
  aiAssistantsDescription
}: ProfileTabsProps) {
  const { t } = useTranslation();
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    category: 'all',
    language: 'all',
    responseTime: 'all',
    pricingModel: 'all',
    location: '',
    expertise: [] as string[],
  });

  // Extract unique expertise areas from all chats
  const allExpertise = useMemo(() => {
    const expertiseSet = new Set<string>();
    embeddedChats.forEach(chat => {
      chat.expertise?.forEach((exp: string) => expertiseSet.add(exp));
    });
    return Array.from(expertiseSet).sort();
  }, [embeddedChats]);

  // Filter chats based on search and filters
  const filteredChats = useMemo(() => {
    return embeddedChats.filter(chat => {
      // Search query filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          chat.name?.toLowerCase().includes(query) ||
          chat.description?.toLowerCase().includes(query) ||
          chat.profession?.toLowerCase().includes(query) ||
          chat.expertise?.some((e: string) => e.toLowerCase().includes(query)) ||
          chat.keywords?.some((k: string) => k.toLowerCase().includes(query)) ||
          chat.capabilities_summary?.toLowerCase().includes(query);
        
        if (!matchesSearch) return false;
      }

      // Category filter
      if (filters.category !== 'all' && chat.category !== filters.category) {
        return false;
      }

      // Language filter
      if (filters.language !== 'all' && chat.language !== filters.language) {
        return false;
      }

      // Response time filter
      if (filters.responseTime !== 'all' && chat.response_time !== filters.responseTime) {
        return false;
      }

      // Pricing model filter
      if (filters.pricingModel !== 'all' && chat.pricing_model !== filters.pricingModel) {
        return false;
      }

      // Location filter
      if (filters.location && !chat.location?.toLowerCase().includes(filters.location.toLowerCase())) {
        return false;
      }

      // Expertise filter
      if (filters.expertise.length > 0) {
        const hasExpertise = filters.expertise.some(exp => 
          chat.expertise?.includes(exp)
        );
        if (!hasExpertise) return false;
      }

      return true;
    });
  }, [embeddedChats, searchQuery, filters]);

  const clearFilters = () => {
    setFilters({
      category: 'all',
      language: 'all',
      responseTime: 'all',
      pricingModel: 'all',
      location: '',
      expertise: [],
    });
    setSearchQuery('');
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.category !== 'all') count++;
    if (filters.language !== 'all') count++;
    if (filters.responseTime !== 'all') count++;
    if (filters.pricingModel !== 'all') count++;
    if (filters.location) count++;
    if (filters.expertise.length > 0) count++;
    return count;
  }, [filters]);

  // Group chats by category for the overview
  const chatsByCategory = useMemo(() => {
    const grouped = new Map<string, any[]>();
    embeddedChats.forEach(chat => {
      const category = chat.category || 'other';
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(chat);
    });
    return grouped;
  }, [embeddedChats]);

  return (
    <Tabs defaultValue="assistants" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="assistants" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500/10 data-[state=active]:to-blue-500/10">
          <span className="flex items-center gap-1.5">
            <Bot className="h-4 w-4" />
            <span>AI Assistants {embeddedChats.length > 0 && `(${embeddedChats.length})`}</span>
            <Sparkles className="h-3 w-3" />
          </span>
        </TabsTrigger>
        <TabsTrigger value="overview">
          <span className="flex items-center gap-1.5">
            <Target className="h-4 w-4" />
            <span>Overview</span>
          </span>
        </TabsTrigger>
      </TabsList>
      
      <TabsContent value="assistants" className="pt-6">
        {embeddedChats.length > 0 ? (
          <div className="space-y-6">
            {/* Show general AI assistants description if available */}
            {aiAssistantsDescription && (
              <div className="p-6 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 rounded-xl border border-purple-100 dark:border-purple-900/30">
                <p className="text-foreground whitespace-pre-wrap">{aiAssistantsDescription}</p>
              </div>
            )}

            {/* Search and Filter Bar */}
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('discovery.searchPlaceholder', 'Search by name, expertise, or keywords...')}
                    className="pl-10"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => setShowFilterPanel(!showFilterPanel)}
                  className="gap-2"
                >
                  <Filter className="h-4 w-4" />
                  {t('discovery.filters', 'Filters')}
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="ml-1">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </div>

              {/* Filter Panel */}
              <Collapsible open={showFilterPanel}>
                <CollapsibleContent>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Category Filter */}
                        <div>
                          <Label>{t('discovery.category', 'Category')}</Label>
                          <Select
                            value={filters.category}
                            onValueChange={(value) => setFilters({ ...filters, category: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CATEGORIES.map(cat => (
                                <SelectItem key={cat.value} value={cat.value}>
                                  {cat.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Language Filter */}
                        <div>
                          <Label>{t('discovery.language', 'Language')}</Label>
                          <Select
                            value={filters.language}
                            onValueChange={(value) => setFilters({ ...filters, language: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {LANGUAGES.map(lang => (
                                <SelectItem key={lang.value} value={lang.value}>
                                  {lang.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Response Time Filter */}
                        <div>
                          <Label>{t('discovery.responseTime', 'Response Time')}</Label>
                          <Select
                            value={filters.responseTime}
                            onValueChange={(value) => setFilters({ ...filters, responseTime: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {RESPONSE_TIMES.map(time => (
                                <SelectItem key={time.value} value={time.value}>
                                  {time.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Pricing Model Filter */}
                        <div>
                          <Label>{t('discovery.pricing', 'Pricing')}</Label>
                          <Select
                            value={filters.pricingModel}
                            onValueChange={(value) => setFilters({ ...filters, pricingModel: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PRICING_MODELS.map(model => (
                                <SelectItem key={model.value} value={model.value}>
                                  {model.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Location Filter */}
                        <div className="lg:col-span-2">
                          <Label>{t('discovery.location', 'Location')}</Label>
                          <Input
                            value={filters.location}
                            onChange={(e) => setFilters({ ...filters, location: e.target.value })}
                            placeholder="City or Country..."
                          />
                        </div>

                        {/* Expertise Filter */}
                        {allExpertise.length > 0 && (
                          <div className="lg:col-span-2">
                            <Label>{t('discovery.expertise', 'Expertise Areas')}</Label>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {allExpertise.slice(0, 10).map(exp => (
                                <label key={exp} className="flex items-center gap-2 cursor-pointer">
                                  <Checkbox
                                    checked={filters.expertise.includes(exp)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setFilters({ ...filters, expertise: [...filters.expertise, exp] });
                                      } else {
                                        setFilters({ ...filters, expertise: filters.expertise.filter(e => e !== exp) });
                                      }
                                    }}
                                  />
                                  <span className="text-sm">{exp}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {activeFilterCount > 0 && (
                        <div className="mt-4 pt-4 border-t">
                          <Button variant="ghost" size="sm" onClick={clearFilters}>
                            <X className="h-4 w-4 mr-2" />
                            {t('discovery.clearFilters', 'Clear all filters')}
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>

              {/* Results Count */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {t('discovery.showingResults', 'Showing {{count}} assistants', { count: filteredChats.length })}
                </p>
              </div>
            </div>
            
            {/* Filtered Assistant Cards */}
            {filteredChats.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredChats.map((chat) => (
                  <div key={chat.uuid} className="group">
                    <Card className="h-full hover:shadow-lg transition-all duration-200 hover:scale-[1.02]">
                      <CardContent className="p-6">
                        {/* Header */}
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg mb-1">{chat.name}</h3>
                            {chat.profession && (
                              <p className="text-sm text-muted-foreground">{chat.profession}</p>
                            )}
                          </div>
                          {chat.pricing_model && (
                            <Badge 
                              variant={chat.pricing_model === 'free' ? 'secondary' : 'outline'}
                              className="ml-2"
                            >
                              {chat.pricing_model === 'free' ? 'Free' : 
                               chat.pricing_model === 'freemium' ? 'Freemium' :
                               chat.pricing_model === 'subscription' ? 'Paid' : 
                               chat.pricing_model}
                            </Badge>
                          )}
                        </div>

                        {/* Description */}
                        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                          {chat.capabilities_summary || chat.description || 'AI assistant ready to help'}
                        </p>

                        {/* Metadata */}
                        <div className="space-y-2 mb-4">
                          <div className="flex flex-wrap gap-2 text-xs">
                            {chat.location && (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <MapPin className="h-3 w-3" />
                                <span>{chat.location}</span>
                              </div>
                            )}
                            {chat.language && chat.language !== 'en' && (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Globe className="h-3 w-3" />
                                <span>{LANGUAGES.find(l => l.value === chat.language)?.label || chat.language}</span>
                              </div>
                            )}
                            {chat.response_time && (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                <span>{RESPONSE_TIMES.find(r => r.value === chat.response_time)?.label || chat.response_time}</span>
                              </div>
                            )}
                            {chat.company_name && (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Building2 className="h-3 w-3" />
                                <span>{chat.company_name}</span>
                              </div>
                            )}
                          </div>

                          {/* Category and Expertise */}
                          <div className="flex flex-wrap gap-1">
                            {chat.category && (
                              <Badge variant="secondary" className="text-xs">
                                {CATEGORIES.find(c => c.value === chat.category)?.label || chat.category}
                              </Badge>
                            )}
                            {chat.expertise?.slice(0, 2).map((exp: string, idx: number) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {exp}
                              </Badge>
                            ))}
                            {chat.expertise?.length > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{chat.expertise.length - 2}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                          <Button 
                            className="flex-1" 
                            variant="default"
                            size="sm"
                            onClick={() => {
                              const chatUrl = chat.slug ? `/chat/${chat.slug}` : `/chat/${chat.uuid}`;
                              window.open(chatUrl, '_blank');
                            }}
                          >
                            <MessageSquare className="h-4 w-4 mr-2" />
                            Start Chat
                          </Button>
                          {isOwner && (
                            <Button 
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                window.location.href = `/embedded-chat/${chat.uuid}`;
                              }}
                            >
                              Edit
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  {searchQuery || activeFilterCount > 0 
                    ? 'No assistants match your filters. Try adjusting your search criteria.'
                    : 'No assistants available.'}
                </p>
                {(searchQuery || activeFilterCount > 0) && (
                  <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-16 px-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/20 dark:to-blue-900/20 mb-6">
              <Bot className="h-10 w-10 text-purple-600 dark:text-purple-400" />
            </div>
            <p className="text-xl font-medium mb-3">No AI Assistants Yet</p>
            <p className="text-muted-foreground max-w-md mx-auto">
              {isOwner 
                ? "✨ Ready to add AI assistants? Head to your Hubs and enable Embedded Chat to bring your profile to life!"
                : "This profile doesn't have any AI assistants yet. Check back soon!"}
            </p>
          </div>
        )}
      </TabsContent>

      <TabsContent value="overview" className="pt-6">
        <div className="space-y-6">
          {/* Profile Overview Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">{embeddedChats.length}</div>
                <p className="text-sm text-muted-foreground">Total Assistants</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">{chatsByCategory.size}</div>
                <p className="text-sm text-muted-foreground">Categories</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">
                  {embeddedChats.filter(c => c.pricing_model === 'free').length}
                </div>
                <p className="text-sm text-muted-foreground">Free Assistants</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">
                  {new Set(embeddedChats.map(c => c.language).filter(Boolean)).size}
                </div>
                <p className="text-sm text-muted-foreground">Languages</p>
              </CardContent>
            </Card>
          </div>

          {/* Categories Breakdown */}
          {chatsByCategory.size > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Assistants by Category</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from(chatsByCategory.entries()).map(([category, chats]) => (
                  <Card key={category}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">
                          {CATEGORIES.find(c => c.value === category)?.label || category}
                        </span>
                        <Badge variant="secondary">{chats.length}</Badge>
                      </div>
                      <div className="space-y-1">
                        {chats.slice(0, 3).map(chat => (
                          <p key={chat.uuid} className="text-sm text-muted-foreground truncate">
                            • {chat.name}
                          </p>
                        ))}
                        {chats.length > 3 && (
                          <p className="text-sm text-muted-foreground">
                            +{chats.length - 3} more
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Expertise Cloud */}
          {allExpertise.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Areas of Expertise</h3>
              <div className="flex flex-wrap gap-2">
                {allExpertise.map(exp => (
                  <Badge key={exp} variant="outline" className="py-1.5 px-3">
                    {exp}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}