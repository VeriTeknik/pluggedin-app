import { useCallback } from 'react';

import type { McpIndex, McpServerCategory } from '@/types/search';

export const useFilteredResults = (
  data: Record<string, McpIndex> | undefined,
  tags: string[],
  category: McpServerCategory | ''
) => {
  return useCallback((): Record<string, McpIndex> | undefined => {
    if (!data) {
      return undefined;
    }
    
    return Object.entries(data).reduce((acc, [key, item]) => {
      let include = true;
      
      // Filter by tags if any are selected
      if (tags.length > 0 && (!item.tags || !item.tags.some(tag => tags.includes(tag)))) {
        include = false;
      }
      
      // Filter by category if selected
      if (category && item.category !== category) {
        include = false;
      }
      
      if (include) {
        acc[key] = item;
      }
      
      return acc;
    }, {} as Record<string, McpIndex>);
  }, [data, tags, category]);
}; 