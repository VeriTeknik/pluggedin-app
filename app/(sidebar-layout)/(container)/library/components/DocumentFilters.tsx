'use client';

import { format } from 'date-fns';
import {
  Calendar,
  ChevronDown,
  Filter,
  RotateCcw,
  Sparkles,
  Tag,
  X
} from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import { DateRange } from 'react-day-picker';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export interface DocumentFiltersState {
  source?: 'all' | 'upload' | 'ai_generated' | 'api';
  modelProvider?: string;
  modelName?: string;
  dateRange?: DateRange;
  tags?: string[];
  category?: string;
  searchQuery?: string;
}

interface DocumentFiltersProps {
  filters: DocumentFiltersState;
  onFiltersChange: (filters: DocumentFiltersState) => void;
  availableTags?: string[];
  availableModels?: Array<{ provider: string; name: string }>;
  className?: string;
}

const MODEL_PROVIDERS = [
  { value: 'anthropic', label: 'Anthropic', icon: '🤖' },
  { value: 'openai', label: 'OpenAI', icon: '🧠' },
  { value: 'google', label: 'Google', icon: '🔮' },
  { value: 'meta', label: 'Meta', icon: '🦙' },
  { value: 'mistral', label: 'Mistral', icon: '🌊' },
  { value: 'cohere', label: 'Cohere', icon: '🏛️' },
  { value: 'xai', label: 'xAI', icon: '✨' },
];

const CATEGORIES = [
  { value: 'report', label: 'Report', icon: '📊' },
  { value: 'analysis', label: 'Analysis', icon: '🔍' },
  { value: 'documentation', label: 'Documentation', icon: '📚' },
  { value: 'guide', label: 'Guide', icon: '📖' },
  { value: 'research', label: 'Research', icon: '🔬' },
  { value: 'code', label: 'Code', icon: '💻' },
  { value: 'other', label: 'Other', icon: '📄' },
];

// Preset filter configurations
const FILTER_PRESETS = [
  { id: 'recent-ai', label: 'Recent AI Docs', filters: { source: 'ai_generated' as const, dateRange: { from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), to: new Date() } } },
  { id: 'claude', label: 'Claude Docs', filters: { source: 'ai_generated' as const, modelProvider: 'anthropic' } },
  { id: 'uploads', label: 'Uploads Only', filters: { source: 'upload' as const } },
  { id: 'code-docs', label: 'Code & Docs', filters: { category: 'code,documentation' } },
];

export function DocumentFilters({
  filters,
  onFiltersChange,
  availableTags = [],
  availableModels = [],
  className,
}: DocumentFiltersProps) {
  const { t } = useTranslation('library');
  const [isDateOpen, setIsDateOpen] = useState(false);
  const [isTagsOpen, setIsTagsOpen] = useState(false);
  const [isModelOpen, setIsModelOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState('');

  // Memoize expensive filter count calculation
  const activeFilterCount = useMemo(() => {
    return Object.values(filters).filter(v =>
      v !== undefined && v !== 'all' && v !== ''
    ).length;
  }, [filters]);

  const handleReset = () => {
    onFiltersChange({});
  };

  const handleSourceChange = (source: DocumentFiltersState['source']) => {
    onFiltersChange({ ...filters, source });
  };

  const handleModelProviderChange = (provider: string) => {
    const newFilters = { ...filters, modelProvider: provider };
    // Clear model name when provider changes
    if (provider !== filters.modelProvider) {
      delete newFilters.modelName;
    }
    onFiltersChange(newFilters);
  };

  const handleDateRangeChange = (range: DateRange | undefined) => {
    onFiltersChange({ ...filters, dateRange: range });
  };

  const handleTagToggle = (tag: string) => {
    const currentTags = filters.tags || [];
    const newTags = currentTags.includes(tag)
      ? currentTags.filter(t => t !== tag)
      : [...currentTags, tag];

    onFiltersChange({
      ...filters,
      tags: newTags.length > 0 ? newTags : undefined
    });
  };

  const handleCategoryChange = (category: string) => {
    onFiltersChange({
      ...filters,
      category: filters.category === category ? undefined : category
    });
  };

  const applyPreset = (preset: typeof FILTER_PRESETS[0]) => {
    onFiltersChange({ ...filters, ...preset.filters });
  };

  // Memoize filtered tags to avoid recalculating on every render
  const filteredTags = useMemo(() => {
    return availableTags.filter(tag =>
      tag.toLowerCase().includes(tagSearch.toLowerCase())
    );
  }, [availableTags, tagSearch]);

  // Memoize provider models filtering
  const providerModels = useMemo(() => {
    return availableModels.filter(
      m => m.provider === filters.modelProvider
    );
  }, [availableModels, filters.modelProvider]);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Quick Presets */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground">
          {t('filters.quickFilters', 'Quick filters:')}
        </span>
        {FILTER_PRESETS.map(preset => (
          <Button
            key={preset.id}
            variant="outline"
            size="sm"
            onClick={() => applyPreset(preset)}
            className="h-7"
          >
            {preset.label}
          </Button>
        ))}
      </div>

      <Separator />

      {/* Main Filters */}
      <div className="flex flex-wrap gap-2">
        {/* Source Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              {filters.source === 'ai_generated' ? (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {t('filters.aiGenerated', 'AI Generated')}
                </>
              ) : filters.source === 'upload' ? (
                <>
                  {t('filters.uploaded', 'Uploaded')}
                </>
              ) : filters.source === 'api' ? (
                <>
                  {t('filters.api', 'API')}
                </>
              ) : (
                <>
                  {t('filters.allSources', 'All Sources')}
                </>
              )}
              <ChevronDown className="ml-2 h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuCheckboxItem
              checked={!filters.source || filters.source === 'all'}
              onCheckedChange={() => handleSourceChange('all')}
            >
              {t('filters.allSources', 'All Sources')}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={filters.source === 'upload'}
              onCheckedChange={() => handleSourceChange('upload')}
            >
              {t('filters.uploaded', 'Uploaded')}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={filters.source === 'ai_generated'}
              onCheckedChange={() => handleSourceChange('ai_generated')}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {t('filters.aiGenerated', 'AI Generated')}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={filters.source === 'api'}
              onCheckedChange={() => handleSourceChange('api')}
            >
              {t('filters.api', 'API')}
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Model Provider Filter (only show if AI Generated is selected) */}
        {filters.source === 'ai_generated' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                {filters.modelProvider ? (
                  <>
                    {MODEL_PROVIDERS.find(p => p.value === filters.modelProvider)?.icon}{' '}
                    {MODEL_PROVIDERS.find(p => p.value === filters.modelProvider)?.label}
                  </>
                ) : (
                  t('filters.allModels', 'All Models')
                )}
                <ChevronDown className="ml-2 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuCheckboxItem
                checked={!filters.modelProvider}
                onCheckedChange={() => handleModelProviderChange('')}
              >
                {t('filters.allModels', 'All Models')}
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              {MODEL_PROVIDERS.map(provider => (
                <DropdownMenuCheckboxItem
                  key={provider.value}
                  checked={filters.modelProvider === provider.value}
                  onCheckedChange={() => handleModelProviderChange(provider.value)}
                >
                  {provider.icon} {provider.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Date Range Filter */}
        <Popover open={isDateOpen} onOpenChange={setIsDateOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              <Calendar className="mr-2 h-4 w-4" />
              {filters.dateRange?.from ? (
                filters.dateRange.to ? (
                  <>
                    {format(filters.dateRange.from, 'MMM d')} -{' '}
                    {format(filters.dateRange.to, 'MMM d')}
                  </>
                ) : (
                  format(filters.dateRange.from, 'MMM d, yyyy')
                )
              ) : (
                t('filters.dateRange', 'Date Range')
              )}
              {filters.dateRange && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-2 h-4 w-4 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDateRangeChange(undefined);
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarComponent
              initialFocus
              mode="range"
              defaultMonth={filters.dateRange?.from}
              selected={filters.dateRange}
              onSelect={handleDateRangeChange}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>

        {/* Tags Filter */}
        <Popover open={isTagsOpen} onOpenChange={setIsTagsOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              <Tag className="mr-2 h-4 w-4" />
              {filters.tags && filters.tags.length > 0 ? (
                <>
                  {filters.tags.length} {t('filters.tagsSelected', 'tags')}
                </>
              ) : (
                t('filters.tags', 'Tags')
              )}
              <ChevronDown className="ml-2 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <Command>
              <CommandInput
                placeholder={t('filters.searchTags', 'Search tags...')}
                value={tagSearch}
                onValueChange={setTagSearch}
              />
              <CommandEmpty>{t('filters.noTags', 'No tags found')}</CommandEmpty>
              <CommandGroup>
                <ScrollArea className="h-48">
                  {filteredTags.map(tag => (
                    <CommandItem
                      key={tag}
                      onSelect={() => handleTagToggle(tag)}
                    >
                      <div className="flex items-center gap-2 w-full">
                        <input
                          type="checkbox"
                          checked={filters.tags?.includes(tag) || false}
                          onChange={() => handleTagToggle(tag)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4"
                          aria-label={`Select tag ${tag}`}
                        />
                        <span className="flex-1">{tag}</span>
                        {filters.tags?.includes(tag) && (
                          <Badge variant="secondary" className="ml-auto">
                            ✓
                          </Badge>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </ScrollArea>
              </CommandGroup>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Category Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              {filters.category ? (
                <>
                  {CATEGORIES.find(c => c.value === filters.category)?.icon}{' '}
                  {CATEGORIES.find(c => c.value === filters.category)?.label}
                </>
              ) : (
                <>
                  <Filter className="mr-2 h-4 w-4" />
                  {t('filters.category', 'Category')}
                </>
              )}
              <ChevronDown className="ml-2 h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuCheckboxItem
              checked={!filters.category}
              onCheckedChange={() => handleCategoryChange('')}
            >
              {t('filters.allCategories', 'All Categories')}
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            {CATEGORIES.map(category => (
              <DropdownMenuCheckboxItem
                key={category.value}
                checked={filters.category === category.value}
                onCheckedChange={() => handleCategoryChange(category.value)}
              >
                {category.icon} {category.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Reset Filters */}
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-9"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            {t('filters.reset', 'Reset')} ({activeFilterCount})
          </Button>
        )}
      </div>

      {/* Active Filters Display */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.source && filters.source !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              {t('filters.source', 'Source')}: {filters.source}
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 ml-1"
                onClick={() => handleSourceChange('all')}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}
          {filters.modelProvider && (
            <Badge variant="secondary" className="gap-1">
              {t('filters.model', 'Model')}: {filters.modelProvider}
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 ml-1"
                onClick={() => handleModelProviderChange('')}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}
          {filters.dateRange && (
            <Badge variant="secondary" className="gap-1">
              {t('filters.dates', 'Dates')}: {format(filters.dateRange.from!, 'MMM d')}
              {filters.dateRange.to && ` - ${format(filters.dateRange.to, 'MMM d')}`}
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 ml-1"
                onClick={() => handleDateRangeChange(undefined)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}
          {filters.tags?.map(tag => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 ml-1"
                onClick={() => handleTagToggle(tag)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
          {filters.category && (
            <Badge variant="secondary" className="gap-1">
              {CATEGORIES.find(c => c.value === filters.category)?.label}
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 ml-1"
                onClick={() => handleCategoryChange('')}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}