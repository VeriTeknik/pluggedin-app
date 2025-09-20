/**
 * Shared RAG (Retrieval-Augmented Generation) service
 * Consolidates RAG API interactions to avoid duplication across modules
 */

import { validateExternalUrl } from './url-validator';

export interface RagQueryResponse {
  success: boolean;
  response?: string;
  context?: string;
  sources?: string[];
  documentIds?: string[];
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

export interface RagStorageStatsResponse {
  success: boolean;
  documentsCount?: number;
  totalChunks?: number;
  estimatedStorageMb?: number;
  vectorsCount?: number;
  embeddingDimension?: number;
  error?: string;
  isEstimate?: boolean;
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
  private storageStatsCache: Map<string, { data: RagStorageStatsResponse; expiry: number }>;
  private readonly CACHE_TTL = 60000; // 1 minute cache

  constructor() {
    const ragUrl = process.env.RAG_API_URL || 'http://127.0.0.1:8000';
    // Validate URL to prevent SSRF attacks
    try {
      const validatedUrl = validateExternalUrl(ragUrl, {
        allowLocalhost: process.env.NODE_ENV === 'development'
      });
      // Remove trailing slash if present
      this.ragApiUrl = validatedUrl.toString().replace(/\/$/, '');
    } catch (error) {
      console.error('Invalid RAG_API_URL:', error);
      // Use the default if validation fails
      this.ragApiUrl = 'https://api.plugged.in';
    }

    // Initialize cache
    this.storageStatsCache = new Map();
  }

  private isConfigured(): boolean {
    return !!this.ragApiUrl;
  }

  /**
   * Helper function to retry API calls with exponential backoff
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: any;
    const initialDelay = 1000; // 1 second

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // Don't retry on client errors (4xx) except 429 (rate limit)
        if (error instanceof Error &&
            error.message.includes('status: 4') &&
            !error.message.includes('status: 429')) {
          throw error;
        }

        // Check if we should retry
        if (attempt < maxRetries - 1) {
          const delay = initialDelay * Math.pow(2, attempt);
          const jitter = Math.random() * 0.3 * delay; // Add 30% jitter
          const totalDelay = Math.floor(delay + jitter);

          console.log(`[RAG Service] Retrying ${operationName} after ${totalDelay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, totalDelay));
        }
      }
    }

    // If all retries failed, throw the last error
    console.error(`[RAG Service] All ${maxRetries} attempts failed for ${operationName}`);
    throw lastError;
  }

  /**
   * Parse RAG API response which can be either JSON or plain text
   */
  private async parseRagResponse(response: Response): Promise<any> {
    try {
      return await response.json();
    } catch {
      return await response.text();
    }
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

      // Validate query size (max 10KB)
      if (query.length > 10 * 1024) {
        return {
          success: false,
          error: 'Query too large. Maximum size is 10KB',
        };
      }

      const url = new URL('/rag/rag-query', this.ragApiUrl);
      
      // Add timeout to prevent hanging requests (30 seconds)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
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
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`RAG API error: ${response.status} ${response.statusText}`);
      }

      // Handle both JSON and plain text responses
      const body = await this.parseRagResponse(response);
      const context = typeof body === 'string'
        ? body
        : body.message || body.context || body.response || '';
      
      return {
        success: true,
        context
      };
    } catch (error) {
      console.error('Error querying RAG API for context:', error);
      
      // Check for timeout error
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: 'Request timed out after 30 seconds'
        };
      }
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

      // Validate query size (max 10KB)
      if (query.length > 10 * 1024) {
        return {
          success: false,
          error: 'Query too large. Maximum size is 10KB',
        };
      }

      // Wrap the API call in retry logic
      const result = await this.retryWithBackoff(async () => {
        // Use the same endpoint as queryForContext which works in playground
        const apiUrl = `${this.ragApiUrl}/rag/rag-query`;

        // Add timeout to prevent hanging requests (30 seconds)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: ragIdentifier,
            query: query,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`RAG API responded with status: ${response.status}`);
        }

        return response;
      }, 'RAG query', 2); // Retry up to 2 times for queries

      const response = result;

      // Handle both JSON and plain text responses
      const body = await this.parseRagResponse(response);

      if (typeof body === 'string') {
        return {
          success: true,
          response: body || 'No response received',
          sources: [],
          documentIds: [],
        };
      }

      // Handle new format with sources
      if (body.results !== undefined) {
        return {
          success: true,
          response: body.results || 'No response received',
          sources: body.sources || [],
          documentIds: body.document_ids || [],
        };
      }

      // Handle no documents found case
      if (body.message === 'No relevant documents found') {
        return {
          success: true,
          response: body.message,
          sources: [],
          documentIds: [],
        };
      }

      // Fallback for old format
      return {
        success: true,
        response: body.message || body.response || 'No response received',
        sources: [],
        documentIds: [],
      };
    } catch (error) {
      console.error('Error querying RAG for response:', error);
      
      // Check for timeout error
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: 'Request timed out after 30 seconds'
        };
      }
      // Check for common network errors to RAG API
      if (error instanceof Error) {
        // Check error code first (more reliable), then fall back to message
        const errorCode = (error as any).code;
        const errorMessage = error.message;
        
        if (errorCode === 'ECONNREFUSED' || errorMessage.includes('ECONNREFUSED') ||
            errorCode === 'ETIMEDOUT' || errorMessage.includes('ETIMEDOUT') ||
            errorCode === 'ENOTFOUND' || errorMessage.includes('ENOTFOUND') ||
            errorCode === 'ECONNRESET' || errorMessage.includes('ECONNRESET') ||
            errorCode === 'EHOSTUNREACH' || errorMessage.includes('EHOSTUNREACH') ||
            errorCode === 'ENETUNREACH' || errorMessage.includes('ENETUNREACH')) {
          return {
            success: false,
            error: 'Unable to connect to RAG API service. Please ensure the RAG service is running and reachable.',
          };
        }
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to query RAG',
      };
    }
  }

  /**
   * Upload document to RAG collection
   */
  async uploadDocument(file: File, ragIdentifier: string): Promise<RagUploadResponse> {
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

      // Add timeout for upload (60 seconds for larger files)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      
      const response = await fetch(`${this.ragApiUrl}/rag/upload-to-collection?user_id=${ragIdentifier}`, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          // Don't set Content-Type, let browser set it with boundary for multipart
        },
        body: formData,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`RAG API responded with status: ${response.status}`);
      }

      const result = await response.json();
      
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
      
      // Check for timeout error
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: 'Upload timed out after 60 seconds'
        };
      }
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

      // Add timeout (30 seconds)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch(`${this.ragApiUrl}/rag/delete-from-collection?document_id=${documentId}&user_id=${ragIdentifier}`, {
        method: 'DELETE',
        headers: {
          'accept': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`RAG API responded with status: ${response.status}`);
      }

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

      // Add timeout (30 seconds)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch(`${this.ragApiUrl}/rag/get-collection?user_id=${ragIdentifier}`, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        // Check if it's a backend error we can work around
        if (response.status === 500) {
          try {
            const errorText = await response.text();

            // Check for known backend issues
            if (errorText.includes('milvus_manager') ||
                errorText.includes('Milvus connection') ||
                errorText.includes('Failed to get documents')) {
              console.warn('RAG backend service issue detected:', errorText.substring(0, 200));

              // Return gracefully with empty documents list
              return {
                success: false,
                error: 'Document listing temporarily unavailable due to backend service issues',
                documents: [] // Return empty list to allow search to continue
              };
            }
          } catch (parseError) {
            console.error('Failed to parse error response:', parseError);
          }
        }

        // For other errors, throw as before
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

      const statusUrl = `${this.ragApiUrl}/rag/upload-status/${uploadId}?user_id=${ragIdentifier}`;

      // Add timeout (30 seconds)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch(statusUrl, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);


      if (!response.ok) {
        const errorText = await response.text();
        console.error(`RAG API upload status error (${response.status}): ${errorText}`);
        
        // If upload not found, it might be completed already - check documents
        if (response.status === 404) {
          return {
            success: false,
            error: 'Upload not found - may have completed',
          };
        }
        
        throw new Error(`RAG API responded with status: ${response.status} - ${errorText}`);
      }

      const progress: UploadProgress = await response.json();
      
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

  /**
   * Get storage statistics for RAG documents with caching
   */
  async getStorageStats(ragIdentifier: string): Promise<RagStorageStatsResponse> {
    try {
      if (!this.isConfigured()) {
        return {
          success: false,
          error: 'RAG_API_URL not configured',
        };
      }

      // Check cache first
      const cacheKey = `storage-stats-${ragIdentifier}`;
      const cached = this.storageStatsCache.get(cacheKey);

      if (cached && Date.now() < cached.expiry) {
        return cached.data;
      }

      // Try to fetch from the backend storage-stats endpoint
      try {
        const response = await fetch(`${this.ragApiUrl}/rag/storage-stats?user_id=${ragIdentifier}`, {
          method: 'GET',
          headers: {
            'accept': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();

          const result = {
            success: true,
            documentsCount: data.documents_count || 0,
            totalChunks: data.total_chunks || 0,
            estimatedStorageMb: data.estimated_storage_mb || 0,
            vectorsCount: data.vectors_count || 0,
            embeddingDimension: data.embedding_dimension || 1536,
            isEstimate: false,
          };

          // Cache successful result
          this.storageStatsCache.set(cacheKey, {
            data: result,
            expiry: Date.now() + this.CACHE_TTL
          });

          return result;
        }

        console.log('Backend storage-stats endpoint returned:', response.status);
      } catch (error) {
        console.log('Failed to fetch from backend, using fallback:', error);
      }

      // Fallback: try to get document count as a simple approach
      const docsResponse = await this.getDocuments(ragIdentifier);
      if (docsResponse.success && docsResponse.documents) {
        const documentsCount = docsResponse.documents.length;

        if (documentsCount > 0) {
          // Estimate storage based on average document size
          const avgChunksPerDoc = 25; // Average chunks per document
          const avgBytesPerVector = 1536 * 4; // 1536 dimensions * 4 bytes per float32
          const estimatedStorageMb = (documentsCount * avgChunksPerDoc * avgBytesPerVector) / (1024 * 1024);

          return {
            success: true,
            documentsCount,
            totalChunks: documentsCount * avgChunksPerDoc,
            estimatedStorageMb: Math.round(estimatedStorageMb * 10) / 10,
            vectorsCount: documentsCount * avgChunksPerDoc,
            embeddingDimension: 1536,
            isEstimate: true,
          };
        }
      }

      // No documents found
      return {
        success: true,
        documentsCount: 0,
        totalChunks: 0,
        estimatedStorageMb: 0,
        vectorsCount: 0,
        embeddingDimension: 1536,
        isEstimate: true,
      };
    } catch (error) {
      console.error('Error getting storage stats:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get storage statistics',
      };
    }
  }
}

// Export singleton instance
export const ragService = new RagService(); 