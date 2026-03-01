export interface ModelAttribution {
  modelName: string;
  modelProvider: string;
  contributionType: 'created' | 'updated';
  timestamp: string;
  metadata?: any;
}

export interface Doc {
  uuid: string;
  user_id: string;
  project_uuid?: string | null;
  profile_uuid?: string | null;
  name: string;
  description?: string | null;
  file_name: string;
  file_size: number;
  mime_type: string;
  file_path: string;
  tags?: string[] | null;
  rag_document_id?: string | null;
  source: 'upload' | 'ai_generated' | 'api';
  upload_metadata?: {
    purpose?: string;
    relatedTo?: string;
    notes?: string;
    uploadMethod?: 'drag-drop' | 'file-picker' | 'api' | 'paste';
    userAgent?: string;
    uploadedAt?: string;
    originalFileName?: string;
    fileLastModified?: string;
  } | null;
  ai_metadata?: {
    model?: {
      name: string;
      provider: string;
      version?: string;
    };
    context?: string;
    timestamp?: string;
    sessionId?: string;
    prompt?: string;
    updateReason?: string;
    changesFromPrompt?: string;
    changeSummary?: string;
    conversationContext?: Array<{
      role: string;
      content: string;
    }> | string[];
    sourceDocuments?: string[];
    generationParams?: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
    };
    visibility?: string;
    lastUpdatedBy?: {
      name: string;
      provider: string;
      version?: string;
    };
    lastUpdateTimestamp?: string;
    [key: string]: any; // Allow any additional fields
  } | null;
  content_hash?: string | null;
  visibility: 'private' | 'workspace' | 'public';
  version: number;
  parent_document_id?: string | null;
  created_at: Date;
  updated_at: Date;
  modelAttributions?: ModelAttribution[];
}

export interface DocUploadResponse {
  success: boolean;
  doc?: Doc;
  error?: string;
  ragProcessed?: boolean;
  ragError?: string;
}

export interface DocDeleteResponse {
  success: boolean;
  error?: string;
}

export interface DocListResponse {
  success: boolean;
  docs?: Doc[];
  error?: string;
}

 