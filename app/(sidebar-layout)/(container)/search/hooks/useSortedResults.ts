import { useCallback } from 'react';

import type { McpIndex } from '@/types/search';

type SortOption = 'relevance' | 'popularity' | 'recent' | 'stars';

export const useSortedResults = (
  data: Record<string, McpIndex> | undefined,
  sort: SortOption,
  getFilteredResults: () => Record<string, McpIndex> | undefined
) => {
  return useCallback((): Record<string, McpIndex> | undefined => {
    if (!data) {
      return undefined;
    }
    
    const filtered = getFilteredResults();
    if (!filtered || Object.keys(filtered).length === 0) {
      return filtered;
    }
    
    const entries = Object.entries(filtered);
    
    switch (sort) {
      case 'popularity':
        return Object.fromEntries(
          entries.sort((a, b) => {
            const aCount = a[1].useCount || a[1].package_download_count || 0;
            const bCount = b[1].useCount || b[1].package_download_count || 0;
            return (bCount as number) - (aCount as number);
          })
        );
        
      case 'recent':
        return Object.fromEntries(
          entries.sort((a, b) => {
            const aDate = a[1].updated_at ? new Date(a[1].updated_at) : new Date(0);
            const bDate = b[1].updated_at ? new Date(b[1].updated_at) : new Date(0);
            return bDate.getTime() - aDate.getTime();
          })
        );
        
      case 'stars':
        return Object.fromEntries(
          entries.sort((a, b) => {
            const aStars = a[1].github_stars || 0;
            const bStars = b[1].github_stars || 0;
            return (bStars as number) - (aStars as number);
          })
        );
        
      default: // 'relevance' - keep original order
        return filtered;
    }
  }, [data, getFilteredResults, sort]);
}; 