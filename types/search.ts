import { McpServerSource } from '@/db/schema';

// MCP Server Categories
export enum McpServerCategory {
  LLM = 'LLM',
  UTILITY = 'Utility',
  TOOL = 'Tool',
  DATA = 'Data Access',
  CONNECTOR = 'Connector',
  SEARCH = 'Search',
  CODE = 'Code',
  IMAGE = 'Image',
  AUDIO = 'Audio',
  VIDEO = 'Video',
  OTHER = 'Other'
}

export interface McpIndex {
  name: string;
  description: string;
  githubUrl: string | null;
  package_name: string | null;
  command: string;
  args: string[];
  envs: string[] | Array<{ name: string; description?: string }>;
  github_stars: number | null;
  package_registry: string | null;
  package_download_count: number | null;
  source?: McpServerSource;
  external_id?: string;
  qualifiedName?: string; // For Smithery servers
  useCount?: number; // For usage metrics
  isDeployed?: boolean; // For Smithery deployment status
  category?: McpServerCategory; // For categorization
  tags?: string[]; // For tagging
  updated_at?: string; // Last update timestamp
  url?: string | null; // URL for SSE servers
  rating?: number; // Average user rating (1-5)
  ratingCount?: number; // Number of ratings (Changed from rating_count)
  installation_count?: number; // Number of installations
  shared_by?: string | null; // Username or name of the profile that shared the server
  shared_by_profile_url?: string | null; // URL to the profile of the user who shared the server
}

export interface SearchIndex {
  [key: string]: McpIndex;
}

export interface PaginatedSearchResult {
  results: SearchIndex;
  total: number;
  offset: number;
  pageSize: number;
  hasMore: boolean;
}

export interface SmitheryServer {
  qualifiedName: string;
  displayName: string;
  description: string;
  homepage: string;
  useCount: number;
  isDeployed: boolean;
  createdAt: string;
}

export interface SmitheryPagination {
  currentPage: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
}

export interface SmitherySearchResponse {
  servers: SmitheryServer[];
  pagination: SmitheryPagination;
}

export interface SmitheryServerDetail {
  qualifiedName: string;
  displayName: string;
  deploymentUrl: string;
  connections: Array<{
    type: string;
    url?: string;
    configSchema: Record<string, any>;
  }>;
}

export interface NpmPackage {
  name: string;
  version: string;
  description: string;
  repository?: {
    type: string;
    url: string;
  };
  homepage?: string;
  downloads: number;
  keywords: string[];
}

export interface NpmSearchResponse {
  objects: Array<{
    package: NpmPackage;
    score: {
      final: number;
      detail: {
        quality: number;
        popularity: number;
        maintenance: number;
      };
    };
    searchScore: number;
  }>;
  total: number;
}
