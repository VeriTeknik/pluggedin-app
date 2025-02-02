export interface McpIndex {
  name: string;
  description: string;
  githubUrl: string | null;
  package_name: string | null;
  command: string;
  args: string[];
  envs: string[];
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
