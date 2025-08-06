'use client';

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  MessageSquare, 
  MapPin, 
  Globe, 
  Clock, 
  Briefcase,
  DollarSign,
  Filter,
  Search,
  ChevronDown,
  X,
  Sparkles,
  Users
} from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { EmbeddedChat } from '@/types/social';

interface ExtendedEmbeddedChat extends EmbeddedChat {
  location?: string | null;
  profession?: string | null;
  expertise?: string[];
  category?: string | null;
  language?: string;
  response_time?: string | null;
  pricing_model?: string | null;
  industry?: string | null;
  keywords?: string[];
  capabilities_summary?: string | null;
  company_name?: string | null;
}

interface EmbeddedChatsDiscoveryProps {
  chats: ExtendedEmbeddedChat[];
  isLoading?: boolean;
  showFilters?: boolean;
}

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

export function EmbeddedChatsDiscovery({ 
  chats, 
  isLoading = false,
  showFilters = true 
}: EmbeddedChatsDiscoveryProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
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
    chats.forEach(chat => {
      chat.expertise?.forEach(exp => expertiseSet.add(exp));
    });
    return Array.from(expertiseSet).sort();
  }, [chats]);

  // Filter chats based on search and filters
  const filteredChats = useMemo(() => {
    return chats.filter(chat => {
      // Search query filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          chat.title?.toLowerCase().includes(query) ||
          chat.description?.toLowerCase().includes(query) ||
          chat.profession?.toLowerCase().includes(query) ||
          chat.expertise?.some(e => e.toLowerCase().includes(query)) ||
          chat.keywords?.some(k => k.toLowerCase().includes(query)) ||
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
  }, [chats, searchQuery, filters]);

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

  if (isLoading) {
    return (
      <div className="space-y-4">
        {showFilters && (
          <div className="h-12 bg-muted rounded-lg animate-pulse"></div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, index) => (
            <Card key={index} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-6 bg-muted rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-muted rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="h-4 bg-muted rounded w-full mb-2"></div>
                <div className="h-4 bg-muted rounded w-4/5"></div>
              </CardContent>
              <CardFooter>
                <div className="h-10 bg-muted rounded w-28"></div>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search and Filter Bar */}
      {showFilters && (
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
                    <div>
                      <Label>{t('discovery.location', 'Location')}</Label>
                      <Input
                        value={filters.location}
                        onChange={(e) => setFilters({ ...filters, location: e.target.value })}
                        placeholder="City or Country..."
                      />
                    </div>

                    {/* Expertise Filter */}
                    {allExpertise.length > 0 && (
                      <div className="lg:col-span-3">
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
      )}

      {/* Results */}
      {filteredChats.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium mb-2">
              {searchQuery || activeFilterCount > 0 
                ? t('discovery.noResults', 'No assistants found')
                : t('discovery.noAssistants', 'No AI assistants available')}
            </p>
            <p className="text-sm text-muted-foreground">
              {searchQuery || activeFilterCount > 0 
                ? t('discovery.tryDifferentFilters', 'Try adjusting your search or filters')
                : t('discovery.checkBackLater', 'Check back later for new assistants')}
            </p>
            {activeFilterCount > 0 && (
              <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                {t('discovery.clearFilters', 'Clear filters')}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredChats.map((chat) => (
            <Card key={chat.uuid} className="flex flex-col hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center">
                      <MessageSquare className="h-4 w-4 mr-2 text-primary flex-shrink-0" />
                      <span className="line-clamp-1">{chat.title}</span>
                    </CardTitle>
                    {chat.profession && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {chat.profession}
                      </p>
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
              </CardHeader>
              
              <CardContent className="flex-grow space-y-3">
                {/* Description */}
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {chat.capabilities_summary || chat.description || 'No description provided'}
                </p>

                {/* Discovery Metadata */}
                <div className="space-y-2">
                  {/* Location and Language */}
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
                  </div>

                  {/* Category and Industry */}
                  <div className="flex flex-wrap gap-1">
                    {chat.category && (
                      <Badge variant="secondary" className="text-xs">
                        {CATEGORIES.find(c => c.value === chat.category)?.label || chat.category}
                      </Badge>
                    )}
                    {chat.industry && (
                      <Badge variant="outline" className="text-xs">
                        {chat.industry}
                      </Badge>
                    )}
                  </div>

                  {/* Expertise */}
                  {chat.expertise && chat.expertise.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {chat.expertise.slice(0, 3).map((exp, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {exp}
                        </Badge>
                      ))}
                      {chat.expertise.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{chat.expertise.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Company */}
                  {chat.company_name && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Briefcase className="h-3 w-3" />
                      <span>{chat.company_name}</span>
                    </div>
                  )}
                </div>
              </CardContent>
              
              <CardFooter className="pt-3">
                <Button asChild className="w-full" variant="outline">
                  <Link href={`/chat/${chat.uuid}`}>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    {t('discovery.startChat', 'Start Chat')}
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}