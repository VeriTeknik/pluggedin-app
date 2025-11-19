/**
 * Search page constants and defaults
 */

export const DEFAULT_PAGE_SIZE = 12;

/**
 * Default package registries to show in search results.
 * Empty array means all registries are shown by default.
 */
export const DEFAULT_PACKAGE_REGISTRIES: string[] = [];

/**
 * Package registry filter options
 */
export const PACKAGE_REGISTRIES = [
  { value: 'npm', label: 'NPM (Node.js)', icon: 'Package' },
  { value: 'pypi', label: 'PyPI (Python)', icon: 'Package' },
  { value: 'oci', label: 'Docker (OCI)', icon: 'Box' },
  { value: 'remote', label: 'Remote (SSE/HTTP)', icon: 'Globe' },
  { value: 'mcpb', label: 'MCPB', icon: 'Package' },
  { value: 'nuget', label: 'NuGet', icon: 'Package' },
] as const;

export type SortOption = 'relevance' | 'popularity' | 'rating' | 'recent' | 'stars';
