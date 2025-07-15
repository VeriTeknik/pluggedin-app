import { useCallback, useMemo } from 'react';

import type { McpIndex } from '@/types/search';

type SortOption = 'relevance' | 'popularity' | 'recent' | 'stars';

export interface SortState {
  sort: {
    option: SortOption;
    isDefault: boolean;
  };
  getSortedResults: () => Record<string, McpIndex> | undefined;
}

export const useSortedResults = (
  data: Record<string, McpIndex> | undefined,
  sortOption: SortOption,
  getFilteredResults: () => Record<string, McpIndex> | undefined
): SortState => {
  // Create sort state information
  const sort = useMemo(() => ({
    option: sortOption,
    isDefault: sortOption === 'relevance',
  }), [sortOption]);
  
  const getSortedResults = useCallback((): Record<string, McpIndex> | undefined => {
    if (!data) {
      return undefined;
    }
    
    const filtered = getFilteredResults();
    if (!filtered || Object.keys(filtered).length === 0) {
      return filtered;
    }
    
    // If using default sort, return filtered results as-is
    if (sort.isDefault) {
      return filtered;
    }
    
    const entries = Object.entries(filtered);
    
    switch (sort.option) {
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
            // For community servers that were claimed, use claimed_at as the most recent date
            const aClaimedAt = a[1].claimed_at ? new Date(a[1].claimed_at) : null;
            const aUpdatedAt = a[1].updated_at ? new Date(a[1].updated_at) : null;
            const aDate = aClaimedAt && aUpdatedAt ? 
              (aClaimedAt > aUpdatedAt ? aClaimedAt : aUpdatedAt) : 
              (aClaimedAt || aUpdatedAt || new Date(0));
            
            const bClaimedAt = b[1].claimed_at ? new Date(b[1].claimed_at) : null;
            const bUpdatedAt = b[1].updated_at ? new Date(b[1].updated_at) : null;
            const bDate = bClaimedAt && bUpdatedAt ? 
              (bClaimedAt > bUpdatedAt ? bClaimedAt : bUpdatedAt) : 
              (bClaimedAt || bUpdatedAt || new Date(0));
            
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
  
  return {
    sort,
    getSortedResults
  };
}; 