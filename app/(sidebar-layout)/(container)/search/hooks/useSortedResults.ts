import { useCallback, useMemo } from 'react';

import type { McpIndex } from '@/types/search';

type SortOption = 'relevance' | 'popularity' | 'rating' | 'recent' | 'stars';

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

    // For sorts supported by backend (popularity, rating, recent), trust backend sorting
    // Only apply client-side sorting for relevance and stars
    if (sort.option === 'popularity' || sort.option === 'rating' || sort.option === 'recent') {
      // Backend already sorted these - return as-is
      return filtered;
    }

    // If using default sort (relevance), return filtered results as-is
    if (sort.isDefault) {
      return filtered;
    }

    const entries = Object.entries(filtered);

    switch (sort.option) {
      case 'stars':
        // Stars sort is client-side only (not supported by backend for all sources)
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