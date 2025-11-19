'use client';

import { Github, Package } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { McpServerCategory } from '@/types/search';
import { getCategoryIcon } from '@/utils/categories';

interface ActiveFiltersProps {
  category: McpServerCategory | '';
  tags: string[];
  packageRegistries: string[];
  repositorySource: string;
  onClearCategory: () => void;
  onRemoveTag: (tag: string) => void;
  onRemoveRegistry: (registry: string) => void;
  onClearSource: () => void;
  onClearAll: () => void;
}

export function ActiveFilters({
  category,
  tags,
  packageRegistries,
  repositorySource,
  onClearCategory,
  onRemoveTag,
  onRemoveRegistry,
  onClearSource,
  onClearAll,
}: ActiveFiltersProps) {
  const { t } = useTranslation();

  // Render category icon dynamically
  const renderCategoryIcon = (cat: McpServerCategory) => {
    const iconName = getCategoryIcon(cat);
    const IconComponent = (LucideIcons as Record<string, any>)[iconName];

    return IconComponent ? (
      <IconComponent className='h-4 w-4 mr-2' />
    ) : (
      <LucideIcons.Layers className='h-4 w-4 mr-2' />
    );
  };

  const hasFilters = !!(
    category ||
    tags.length ||
    packageRegistries.length ||
    repositorySource
  );

  if (!hasFilters) return null;

  return (
    <div className='flex flex-wrap gap-2'>
      {category && (
        <Badge variant='secondary' className='flex items-center gap-1'>
          {renderCategoryIcon(category)}
          <span className='truncate max-w-[120px]'>
            {t(`search.categories.${category}`)}
          </span>
          <button
            className='ml-1 hover:bg-accent p-1 rounded-full'
            onClick={onClearCategory}
            aria-label={t('search.removeFilter', 'Remove filter')}>
            ✕
          </button>
        </Badge>
      )}

      {tags.map((tag) => (
        <Badge key={tag} variant='outline' className='max-w-[120px]'>
          <span className='truncate'>#{tag}</span>
          <button
            className='ml-1 hover:bg-accent p-1 rounded-full'
            onClick={() => onRemoveTag(tag)}
            aria-label={t('search.removeFilter', 'Remove filter')}>
            ✕
          </button>
        </Badge>
      ))}

      {packageRegistries.map((pkg) => (
        <Badge
          key={pkg}
          variant='secondary'
          className='flex items-center gap-1'>
          <Package className='h-3 w-3' />
          <span className='truncate max-w-[80px]'>{pkg.toUpperCase()}</span>
          <button
            className='ml-1 hover:bg-accent p-1 rounded-full'
            onClick={() => onRemoveRegistry(pkg)}
            aria-label={t('search.removeFilter', 'Remove filter')}>
            ✕
          </button>
        </Badge>
      ))}

      {repositorySource && (
        <Badge variant='secondary' className='flex items-center gap-1'>
          <Github className='h-3 w-3' />
          <span className='truncate max-w-[80px]'>{repositorySource}</span>
          <button
            className='ml-1 hover:bg-accent p-1 rounded-full'
            onClick={onClearSource}
            aria-label={t('search.removeFilter', 'Remove filter')}>
            ✕
          </button>
        </Badge>
      )}

      <Button
        variant='ghost'
        size='sm'
        className='h-6 text-xs shrink-0'
        onClick={onClearAll}>
        {t('search.clearAllFilters')}
      </Button>
    </div>
  );
}
