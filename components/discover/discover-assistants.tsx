'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { 
  MessageSquare, 
  MapPin, 
  Globe, 
  Clock, 
  Briefcase,
  DollarSign,
  Filter,
  Search,
  X,
  Sparkles,
  Target,
  Building2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import useSWR from 'swr';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { PaginationUi } from '@/app/(sidebar-layout)/(container)/search/components/PaginationUi';

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

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Most Relevant' },
  { value: 'response_time', label: 'Fastest Response' },
  { value: 'recent', label: 'Recently Added' },
  { value: 'popular', label: 'Most Popular' },
];

interface DiscoveryFilters {
  category: string;
  language: string;
  responseTime: string;
  pricingModel: string;
  location: string;
  expertise: string[];
  search: string;
  sort: string;
  page: number;
}

export function DiscoverAssistants() {
  const { t } = useTranslation();
  const router = useRouter();
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [filters, setFilters] = useState<DiscoveryFilters>({
    category: 'all',
    language: 'all',
    responseTime: 'all',
    pricingModel: 'all',
    location: '',
    expertise: [],
    search: '',
    sort: 'relevance',
    page: 1,
  });

  // Build query string from filters
  const buildQueryString = useCallback(() => {
    const params = new URLSearchParams();
    
    if (filters.category !== 'all') params.append('category', filters.category);
    if (filters.language !== 'all') params.append('language', filters.language);
    if (filters.responseTime !== 'all') params.append('responseTime', filters.responseTime);
    if (filters.pricingModel !== 'all') params.append('pricingModel', filters.pricingModel);
    if (filters.location) params.append('location', filters.location);
    if (filters.search) params.append('search', filters.search);
    if (filters.sort !== 'relevance') params.append('sort', filters.sort);
    if (filters.page > 1) params.append('page', filters.page.toString());
    
    filters.expertise.forEach(exp => params.append('expertise', exp));
    
    return params.toString();
  }, [filters]);

  // Fetch assistants
  const queryString = buildQueryString();
  const { data: assistantsData, error, isLoading, mutate } = useSWR(
    `/api/discover/assistants${queryString ? `?${queryString}` : ''}`,
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch assistants');
      return res.json();
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
    }
  );

  // Fetch categories with counts
  const { data: categoriesData } = useSWR(
    '/api/discover/categories',
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch categories');
      return res.json();
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000, // Cache for 1 minute
    }
  );

  // Fetch expertise areas
  const { data: expertiseData } = useSWR(
    `/api/discover/expertise${filters.category !== 'all' ? `?category=${filters.category}` : ''}`,
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch expertise');
      return res.json();
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    }
  );

  const handleFilterChange = (newFilters: Partial<DiscoveryFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters, page: 1 })); // Reset to page 1 on filter change
  };

  const clearFilters = () => {
    setFilters({
      category: 'all',
      language: 'all',
      responseTime: 'all',
      pricingModel: 'all',
      location: '',
      expertise: [],
      search: '',
      sort: 'relevance',
      page: 1,
    });
  };

  const activeFilterCount = [
    filters.category !== 'all',
    filters.language !== 'all',
    filters.responseTime !== 'all',
    filters.pricingModel !== 'all',
    filters.location !== '',
    filters.expertise.length > 0,
  ].filter(Boolean).length;

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-destructive">{t('discover.error', 'Failed to load AI assistants')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search and Filter Bar */}
      <div className="space-y-4">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={filters.search}
              onChange={(e) => handleFilterChange({ search: e.target.value })}
              placeholder={t('discovery.searchPlaceholder', 'Search by name, expertise, or keywords...')}
              className="pl-10"
            />
          </div>
          <Select value={filters.sort} onValueChange={(value) => handleFilterChange({ sort: value })}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            {showFilterPanel ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
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
                      onValueChange={(value) => handleFilterChange({ category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(cat => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                            {categoriesData?.categories?.find((c: any) => c.value === cat.value)?.count && (
                              <span className="ml-2 text-muted-foreground">
                                ({categoriesData.categories.find((c: any) => c.value === cat.value).count})
                              </span>
                            )}
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
                      onValueChange={(value) => handleFilterChange({ language: value })}
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
                      onValueChange={(value) => handleFilterChange({ responseTime: value })}
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
                      onValueChange={(value) => handleFilterChange({ pricingModel: value })}
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
                      onChange={(e) => handleFilterChange({ location: e.target.value })}
                      placeholder="City or Country..."
                    />
                  </div>

                  {/* Expertise Filter */}
                  {expertiseData?.expertise && expertiseData.expertise.length > 0 && (
                    <div className="lg:col-span-2">
                      <Label>{t('discovery.expertise', 'Expertise Areas')}</Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {expertiseData.expertise.slice(0, 10).map((exp: any) => (
                          <label key={exp.name} className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                              checked={filters.expertise.includes(exp.name)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  handleFilterChange({ expertise: [...filters.expertise, exp.name] });
                                } else {
                                  handleFilterChange({ expertise: filters.expertise.filter(e => e !== exp.name) });
                                }
                              }}
                            />
                            <span className="text-sm">
                              {exp.name} ({exp.count})
                            </span>
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
            {isLoading ? (
              t('discovery.loading', 'Loading assistants...')
            ) : (
              t('discovery.showingResults', 'Showing {{count}} assistants', { 
                count: assistantsData?.pagination?.totalCount || 0 
              })
            )}
          </p>
        </div>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, index) => (
            <Card key={index} className="animate-pulse">
              <CardHeader className="pb-2">
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-4/5" />
              </CardContent>
              <CardFooter>
                <Skeleton className="h-10 w-28" />
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : assistantsData?.assistants?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium mb-2">
              {filters.search || activeFilterCount > 0 
                ? t('discovery.noResults', 'No assistants found')
                : t('discovery.noAssistants', 'No AI assistants available')}
            </p>
            <p className="text-sm text-muted-foreground">
              {filters.search || activeFilterCount > 0 
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
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {assistantsData?.assistants?.map((assistant: any) => (
              <Card key={assistant.uuid} className="flex flex-col hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={assistant.avatarUrl} />
                        <AvatarFallback>
                          <MessageSquare className="h-5 w-5" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg line-clamp-1">
                          {assistant.name}
                        </CardTitle>
                        {assistant.discovery.profession && (
                          <p className="text-sm text-muted-foreground">
                            {assistant.discovery.profession}
                          </p>
                        )}
                      </div>
                    </div>
                    {assistant.discovery.pricingModel && (
                      <Badge 
                        variant={assistant.discovery.pricingModel === 'free' ? 'secondary' : 'outline'}
                        className="ml-2"
                      >
                        {assistant.discovery.pricingModel === 'free' ? 'Free' : 
                         assistant.discovery.pricingModel === 'freemium' ? 'Freemium' :
                         assistant.discovery.pricingModel === 'subscription' ? 'Paid' : 
                         assistant.discovery.pricingModel}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                
                <CardContent className="flex-grow space-y-3">
                  {/* Description */}
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {assistant.discovery.capabilitiesSummary || assistant.description || 'No description provided'}
                  </p>

                  {/* Discovery Metadata */}
                  <div className="space-y-2">
                    {/* Location and Language */}
                    <div className="flex flex-wrap gap-2 text-xs">
                      {assistant.discovery.location && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          <span>{assistant.discovery.location}</span>
                        </div>
                      )}
                      {assistant.discovery.language && assistant.discovery.language !== 'en' && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Globe className="h-3 w-3" />
                          <span>{LANGUAGES.find(l => l.value === assistant.discovery.language)?.label || assistant.discovery.language}</span>
                        </div>
                      )}
                      {assistant.discovery.responseTime && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{RESPONSE_TIMES.find(r => r.value === assistant.discovery.responseTime)?.label || assistant.discovery.responseTime}</span>
                        </div>
                      )}
                    </div>

                    {/* Category and Industry */}
                    <div className="flex flex-wrap gap-1">
                      {assistant.discovery.category && (
                        <Badge variant="secondary" className="text-xs">
                          {CATEGORIES.find(c => c.value === assistant.discovery.category)?.label || assistant.discovery.category}
                        </Badge>
                      )}
                      {assistant.discovery.industry && (
                        <Badge variant="outline" className="text-xs">
                          {assistant.discovery.industry}
                        </Badge>
                      )}
                    </div>

                    {/* Expertise */}
                    {assistant.discovery.expertise && assistant.discovery.expertise.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {assistant.discovery.expertise.slice(0, 3).map((exp: string, idx: number) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {exp}
                          </Badge>
                        ))}
                        {assistant.discovery.expertise.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{assistant.discovery.expertise.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* Company */}
                    {assistant.discovery.companyName && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Briefcase className="h-3 w-3" />
                        <span>{assistant.discovery.companyName}</span>
                      </div>
                    )}
                  </div>

                  {/* Owner Info */}
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={assistant.owner.avatarUrl} />
                      <AvatarFallback>{assistant.owner.username?.[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-muted-foreground">
                      by @{assistant.owner.username}
                    </span>
                  </div>
                </CardContent>
                
                <CardFooter className="pt-3">
                  <Button 
                    className="w-full" 
                    variant="outline"
                    onClick={() => {
                      // Navigate to user's assistant page
                      if (assistant.owner.username && assistant.slug) {
                        router.push(`/to/${assistant.owner.username}/${assistant.slug}`);
                      } else if (assistant.owner.username) {
                        router.push(`/to/${assistant.owner.username}/chat/${assistant.uuid}`);
                      }
                    }}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    {t('discovery.startChat', 'Start Chat')}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {assistantsData?.pagination && assistantsData.pagination.totalPages > 1 && (
            <div className="mt-6">
              <PaginationUi
                currentPage={assistantsData.pagination.page}
                totalPages={assistantsData.pagination.totalPages}
                onPageChange={(page) => handleFilterChange({ page })}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}