export interface Doc {
  uuid: string;
  user_id: string;
  profile_uuid?: string | null;
  name: string;
  description?: string | null;
  file_name: string;
  file_size: number;
  mime_type: string;
  file_path: string;
  tags?: string[] | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateDocRequest {
  name: string;
  description?: string;
  tags?: string[];
  file: File;
}

export interface UpdateDocRequest {
  name?: string;
  description?: string;
  tags?: string[];
}

// New interfaces for RAG progress tracking
export interface UploadProgress {
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
  file_name: string;
  file_size: number;
  status: 'processing' | 'completed' | 'failed';
  progress: UploadProgress['progress'];
  message: string;
  document_id: string | null;
  created_at: Date;
}

export interface UploadStatusResponse {
  success: boolean;
  progress?: UploadProgress;
  error?: string;
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

export interface RAGDocumentRequest {
  id: string;
  title: string;
  content: string;
  metadata: {
    filename: string;
    mimeType: string;
    fileSize: number;
    tags?: string[];
    userId: string;
    profileUuid?: string;
  };
} 