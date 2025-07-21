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
  ai_metadata?: {
    model?: {
      name: string;
      provider: string;
      version?: string;
    };
    context?: string;
    timestamp?: string;
    sessionId?: string;
    lastUpdatedBy?: {
      name: string;
      provider: string;
      version?: string;
    };
    lastUpdateTimestamp?: string;
  } | null;
  content_hash?: string | null;
  visibility: 'private' | 'workspace' | 'public';
  version: number;
  parent_document_id?: string | null;
  created_at: Date;
  updated_at: Date;
  modelAttributions?: ModelAttribution[];
}

// New interfaces for RAG progress tracking
interface UploadProgress {
  upload_id: string;
  status: 'processing' | 'completed' | 'failed';
  message: string;
  document_id: string | null;
  progress: {
    step: 'text_extraction' | 'chunking' | 'id_generation' | 'embeddings' | 'database_insertion';
    current: number;
    total: number;
    step_progress: {
      chunks_processed?: number;
      total_chunks?: number;
      batches_completed?: number;
      total_batches?: number;
      percentage: number;
      estimated_remaining_time?: string;
    };
  };
}

export interface UploadProgressState {
  upload_id: string;
  doc_uuid?: string;
  file_name: string;
  file_size: number;
  status: 'processing' | 'completed' | 'failed';
  progress: UploadProgress['progress'];
  message: string;
  document_id: string | null;
  created_at: Date;
}


export interface DocUploadResponse {
  success: boolean;
  doc?: Doc;
  upload_id?: string; // New field for progress tracking
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

 