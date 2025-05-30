export interface Doc {
  uuid: string;
  user_id: string;
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
  };
} 