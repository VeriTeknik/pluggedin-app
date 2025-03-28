import { useCallback, useMemo } from 'react';

import type { McpIndex, McpServerCategory } from '@/types/search';

export interface FilterState {
  filter: {
    tags: string[];
    category: McpServerCategory | '';
    hasTags: boolean;
    hasCategory: boolean;
    isFiltered: boolean;
  };
  getFilteredResults: () => Record<string, McpIndex> | undefined;
}

export const useFilteredResults = (
  data: Record<string, McpIndex> | undefined,
  tags: string[],
  category: McpServerCategory | ''
): FilterState => {
  // Create filter state information
  const filter = useMemo(() => ({
    tags,
    category,
    hasTags: tags.length > 0,
    hasCategory: !!category,
    isFiltered: tags.length > 0 || !!category,
  }), [tags, category]);
  
  const getFilteredResults = useCallback((): Record<string, McpIndex> | undefined => {
    if (!data) {
      return undefined;
    }
    
    // If no filtering is applied, return the original data
    if (!filter.isFiltered) {
      return data;
    }
    
    return Object.entries(data).reduce((acc, [key, item]) => {
      let include = true;
      
      // Filter by tags if any are selected
      if (filter.hasTags && (!item.tags || !item.tags.some(tag => tags.includes(tag)))) {
        include = false;
      }
      
      // Filter by category if selected
      if (filter.hasCategory && item.category !== category) {
        include = false;
      }
      
      if (include) {
        acc[key] = item;
      }
      
      return acc;
    }, {} as Record<string, McpIndex>);
  }, [data, filter, tags, category]);
  
  return {
    filter,
    getFilteredResults
  };
}; 