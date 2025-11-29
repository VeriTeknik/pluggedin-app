/**
 * MCP Server Search Constants
 *
 * Constants used for MCP server search and filtering across the platform.
 */

/**
 * All available package registry types for MCP servers
 * Used when searching/filtering servers from the registry
 */
export const ALL_PACKAGE_REGISTRIES = [
  'npm',
  'pypi',
  'oci',
  'remote',
  'mcpb',
  'nuget'
] as const;

/**
 * Default package registries used for search if none specified
 */
export const DEFAULT_PACKAGE_REGISTRIES = ['npm', 'pypi'] as const;

/**
 * Package registry query parameter string (all registries)
 */
export const ALL_PACKAGE_REGISTRIES_PARAM = ALL_PACKAGE_REGISTRIES.join(',');

/**
 * Package registry query parameter string (default registries only)
 */
export const DEFAULT_PACKAGE_REGISTRIES_PARAM = DEFAULT_PACKAGE_REGISTRIES.join(',');
