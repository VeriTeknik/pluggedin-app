/**
 * Shared RAG (Retrieval-Augmented Generation) service
 * Consolidates RAG API interactions to avoid duplication across modules
 */

export interface RagQueryResponse {
  success: boolean;
  response?: string;
  context?: string;
  error?: string;
}

export interface RagDocumentsResponse {
  success: boolean;
  documents?: Array<[string, string]>; // [filename, document_id] pairs
  error?: string;
}

export interface RagUploadResponse {
  success: boolean;
  upload_id?: string;
  error?: string;
}

export interface UploadProgress {
  status: 'processing' | 'completed' | 'failed';
  progress: {
    current: number;
    total: number;
    step: string;
    step_progress: { percentage: number };
  };
  message: string;
  document_id?: string;
}

export interface UploadStatusResponse {
  success: boolean;
  progress?: UploadProgress;
  error?: string;
}

export interface RAGDocumentRequest {
  id: string;
  title: string;
  content: string;
  metadata?: {
    filename: string;
    mimeType: string;
    fileSize: number;
    tags: string[];
    userId: string;
    profileUuid?: string;
  };
}

class RagService {
  private readonly ragApiUrl: string;

  constructor() {
    this.ragApiUrl = process.env.RAG_API_URL || 'http://127.0.0.1:8000';
  }

  private isConfigured(): boolean {
    return !!this.ragApiUrl;
  }

  /**
   * Query RAG for relevant context (used in playground)
   */
  async queryForContext(query: string, ragIdentifier: string): Promise<RagQueryResponse> {
    try {
      if (!this.isConfigured()) {
        return {
          success: false,
          error: 'RAG_API_URL not configured',
        };
      }

      const url = new URL('/rag/rag-query', this.ragApiUrl);
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query,
          user_id: ragIdentifier,
        }),
      });

      if (!response.ok) {
        throw new Error(`RAG API error: ${response.status} ${response.statusText}`);
      }

      const context = await response.text();
      
      return {
        success: true,
        context
      };
    } catch (error) {
      console.error('Error querying RAG API for context:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Query RAG for direct response (used in docs)
   */
  async queryForResponse(ragIdentifier: string, query: string): Promise<RagQueryResponse> {
    try {
      if (!this.isConfigured()) {
        return {
          success: false,
          error: 'RAG_API_URL not configured',
        };
      }

      const response = await fetch(`${this.ragApiUrl}/rag/query`, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: ragIdentifier,
          query: query,
        }),
      });

      if (!response.ok) {
        throw new Error(`RAG API responded with status: ${response.status}`);
      }

      const result = await response.json();
      
      return {
        success: true,
        response: result.response || result.answer || 'No response received',
      };
    } catch (error) {
      console.error('Error querying RAG for response:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to query RAG',
      };
    }
  }

  /**
   * Upload document to RAG collection
   */
  async uploadDocument(document: RAGDocumentRequest, file: File, ragIdentifier: string): Promise<RagUploadResponse> {
    try {
      if (!this.isConfigured()) {
        return {
          success: false,
          error: 'RAG_API_URL not configured',
        };
      }

      // Create FormData for multipart upload
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${this.ragApiUrl}/rag/upload-to-collection?user_id=${ragIdentifier}`, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          // Don't set Content-Type, let browser set it with boundary for multipart
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`RAG API responded with status: ${response.status}`);
      }

      const result = await response.json();
      console.log(`RAG API upload response:`, JSON.stringify(result, null, 2));
      console.log(`Successfully sent document ${document.id} to RAG API for ${ragIdentifier}, upload_id: ${result.upload_id}`);
      
      if (!result.upload_id) {
        console.error('Warning: No upload_id in RAG API response, falling back to legacy behavior');
        return {
          success: false,
          error: 'No upload_id returned from RAG API'
        };
      }
      
      return { 
        success: true,
        upload_id: result.upload_id 
      };
    } catch (error) {
      console.error('Error sending to RAG API:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload to RAG'
      };
    }
  }

  /**
   * Remove document from RAG collection
   */
  async removeDocument(documentId: string, ragIdentifier: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.isConfigured()) {
        console.warn('RAG_API_URL not configured');
        return { success: true }; // Don't fail if RAG is not configured
      }

      const response = await fetch(`${this.ragApiUrl}/rag/delete-from-collection?document_id=${documentId}&user_id=${ragIdentifier}`, {
        method: 'DELETE',
        headers: {
          'accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`RAG API responded with status: ${response.status}`);
      }

      console.log(`Successfully removed document ${documentId} from RAG API for ${ragIdentifier}`);
      return { success: true };
    } catch (error) {
      console.error('Error removing from RAG API:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove from RAG'
      };
    }
  }

  /**
   * Get documents in RAG collection
   */
  async getDocuments(ragIdentifier: string): Promise<RagDocumentsResponse> {
    try {
      if (!this.isConfigured()) {
        return {
          success: false,
          error: 'RAG_API_URL not configured',
        };
      }

      const response = await fetch(`${this.ragApiUrl}/rag/get-collection?user_id=${ragIdentifier}`, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`RAG API responded with status: ${response.status}`);
      }

      const documents = await response.json();
      
      return {
        success: true,
        documents, // Array of [filename, document_id] pairs
      };
    } catch (error) {
      console.error('Error fetching RAG documents:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch RAG documents',
      };
    }
  }

  /**
   * Check upload status
   */
  async getUploadStatus(uploadId: string, ragIdentifier: string): Promise<UploadStatusResponse> {
    try {
      if (!this.isConfigured()) {
        return {
          success: false,
          error: 'RAG_API_URL not configured',
        };
      }

      console.log(`Checking upload status for uploadId: ${uploadId}, ragIdentifier: ${ragIdentifier}`);
      const statusUrl = `${this.ragApiUrl}/rag/upload-status/${uploadId}?user_id=${ragIdentifier}`;
      console.log(`Making request to: ${statusUrl}`);

      const response = await fetch(statusUrl, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
        },
      });

      console.log(`Upload status response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`RAG API upload status error (${response.status}): ${errorText}`);
        
        // If upload not found, it might be completed already - check documents
        if (response.status === 404) {
          console.log('Upload not found - might be completed already');
          return {
            success: false,
            error: 'Upload not found - may have completed',
          };
        }
        
        throw new Error(`RAG API responded with status: ${response.status} - ${errorText}`);
      }

      const progress: UploadProgress = await response.json();
      console.log('Upload status response:', JSON.stringify(progress, null, 2));
      
      return {
        success: true,
        progress,
      };
    } catch (error) {
      console.error('Error checking upload status:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check upload status',
      };
    }
  }
}

// Export singleton instance
export const ragService = new RagService(); 