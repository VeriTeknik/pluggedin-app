/**
 * Slug generation utilities for MCP servers
 * Used for slug-based tool prefixing to resolve name collisions
 */

/**
 * Generates a URL-friendly slug from a server name
 * @param name - The server name to convert to a slug
 * @returns A URL-friendly slug
 */
export function generateSlug(name: string): string {
  if (!name || typeof name !== 'string') {
    throw new Error('Server name is required and must be a string');
  }

  // Convert to lowercase and replace spaces/special chars with hyphens
  let slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens

  // Ensure minimum length
  if (slug.length === 0) {
    slug = 'server';
  }

  // Ensure maximum length (reasonable for URLs)
  if (slug.length > 50) {
    slug = slug.substring(0, 50).replace(/-$/, ''); // Remove trailing hyphen if truncated
  }

  return slug;
}

/**
 * Generates a unique slug by appending a number if the base slug already exists
 * @param baseSlug - The base slug to make unique
 * @param existingSlugs - Array of existing slugs to check against
 * @returns A unique slug
 */
export function generateUniqueSlug(baseSlug: string, existingSlugs: string[]): string {
  if (!existingSlugs.includes(baseSlug)) {
    return baseSlug;
  }

  let counter = 1;
  let uniqueSlug = `${baseSlug}-${counter}`;

  while (existingSlugs.includes(uniqueSlug)) {
    counter++;
    uniqueSlug = `${baseSlug}-${counter}`;

    // Prevent infinite loop (though unlikely)
    if (counter > 1000) {
      // Add timestamp for guaranteed uniqueness
      uniqueSlug = `${baseSlug}-${Date.now()}`;
      break;
    }
  }

  return uniqueSlug;
}

/**
 * Validates that a string is a valid slug format
 * @param slug - The slug to validate
 * @returns True if the slug is valid
 */
export function isValidSlug(slug: string): boolean {
  if (!slug || typeof slug !== 'string') {
    return false;
  }

  // Slug must be lowercase, contain only letters, numbers, and hyphens
  // Must not start or end with a hyphen
  const slugRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  return slugRegex.test(slug) && slug.length > 0 && slug.length <= 50;
}

/**
 * Creates a slug-based tool name prefix
 * Format: {server_slug}__{original_tool_name}
 * @param serverSlug - The server slug
 * @param originalName - The original tool name
 * @returns The prefixed tool name
 */
export function createSlugPrefixedToolName(serverSlug: string, originalName: string): string {
  if (!serverSlug || !originalName) {
    throw new Error('Both server slug and original name are required');
  }

  if (!isValidSlug(serverSlug)) {
    throw new Error('Invalid server slug format');
  }

  return `${serverSlug}__${originalName}`;
}

/**
 * Parses a slug-prefixed tool name
 * @param toolName - The potentially prefixed tool name
 * @returns Object with originalName and serverSlug, or null if not prefixed
 */
export function parseSlugPrefixedToolName(toolName: string): { originalName: string; serverSlug: string } | null {
  if (!toolName || typeof toolName !== 'string') {
    return null;
  }

  const prefixSeparator = '__';
  const separatorIndex = toolName.indexOf(prefixSeparator);

  if (separatorIndex === -1) {
    return null; // Not a prefixed name
  }

  const potentialSlug = toolName.substring(0, separatorIndex);
  const potentialOriginalName = toolName.substring(separatorIndex + prefixSeparator.length);

  // Validate that the first part is a valid slug
  if (!isValidSlug(potentialSlug) || !potentialOriginalName) {
    return null; // Invalid slug or empty original name
  }

  return {
    originalName: potentialOriginalName,
    serverSlug: potentialSlug
  };
}