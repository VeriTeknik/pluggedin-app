// Types for document versioning and AI metadata

export interface ModelInfo {
  name: string;
  provider: string;
  version?: string;
}

export interface ContentDiff {
  additions?: number;
  deletions?: number;
  changes?: Array<{
    type: 'addition' | 'deletion' | 'modification';
    content: string;
  }>;
}

export interface DocumentVersion {
  id: string;
  version_number: number;
  content: string;
  content_diff?: ContentDiff;
  created_by_model: ModelInfo;
  created_at: Date;
  change_summary?: string;
  parentId?: string;
}

export interface AIMetadata {
  model: ModelInfo;
  context?: string;
  prompt?: string;
  conversationContext?: Array<{
    role: string;
    content: string;
  }>;
  sourceDocuments?: string[];
  generationParams?: {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
  };
  timestamp?: string;
  sessionId?: string;
}

export interface VersionHistoryResponse {
  versions: DocumentVersion[];
  total: number;
}