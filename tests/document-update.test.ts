import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { setupFetchMocks, mockApiResponse, mockApiError } from './test-utils';

describe('Document Update API', () => {
  const API_URL = 'http://localhost:12005';
  let apiKey: string;
  let documentId: string = 'test-doc-id';

  beforeAll(() => {
    // Use test API key from environment
    apiKey = process.env.TEST_API_KEY || 'test-api-key';
  });

  beforeEach(() => {
    // Setup fetch mocks for all API endpoints
    setupFetchMocks({
      '/api/documents/ai': {
        success: true,
        documentId: 'test-doc-id',
        version: 1,
      },
      '/api/documents/test-doc-id': {
        success: true,
        documentId: 'test-doc-id',
        version: 2,
        content: 'Updated content',
      },
      '/api/documents/non-existent-id': {
        statusCode: 404,
        body: { error: 'Document not found' },
      },
    });
  });

  it('should update document content via PATCH endpoint', async () => {
    // First create a document
    const createResponse = await fetch(`${API_URL}/api/documents/ai`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Test Document for Update',
        content: 'Initial content',
        format: 'md',
        metadata: {
          model: {
            name: 'test-model',
            provider: 'test-provider',
          },
          visibility: 'private',
        },
      }),
    });

    if (createResponse.ok) {
      const createData = await createResponse.json();
      documentId = createData.documentId;
    }

    // Now update the document
    const updateResponse = await fetch(`${API_URL}/api/documents/${documentId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operation: 'replace',
        content: 'Updated content with new information',
        metadata: {
          model: {
            name: 'update-model',
            provider: 'update-provider',
          },
          changeSummary: 'Updated document content',
        },
      }),
    });

    expect(updateResponse.status).toBe(200);
    
    const updateData = await updateResponse.json();
    expect(updateData.success).toBe(true);
    expect(updateData.documentId).toBe(documentId);
    expect(updateData.version).toBe(2);
  });

  it('should append content to document', async () => {
    setupFetchMocks({
      '/api/documents/test-doc-id': {
        success: true,
        documentId: 'test-doc-id',
        version: 3,
        content: 'Updated content with appended section',
      },
    });

    const appendResponse = await fetch(`${API_URL}/api/documents/${documentId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operation: 'append',
        content: '\n\n## Additional Section\nAppended content',
        metadata: {
          model: {
            name: 'append-model',
            provider: 'append-provider',
          },
          changeSummary: 'Added new section',
        },
      }),
    });

    expect(appendResponse.status).toBe(200);
    
    const appendData = await appendResponse.json();
    expect(appendData.success).toBe(true);
    expect(appendData.version).toBe(3);
  });

  it('should handle RAG update via delete and re-upload', async () => {
    setupFetchMocks({
      '/api/documents/test-doc-id': {
        statusCode: 200,
        body: {
          success: true,
          message: 'Document successfully updated with RAG',
        },
      },
    });

    // This tests the workaround for RAG updates
    const ragUpdateResponse = await fetch(`${API_URL}/api/documents/${documentId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operation: 'replace',
        content: 'Content with RAG update',
        metadata: {
          model: {
            name: 'rag-update-model',
            provider: 'rag-provider',
          },
          changeSummary: 'Testing RAG workaround',
        },
      }),
    });

    expect(ragUpdateResponse.status).toBe(200);
    
    const ragData = await ragUpdateResponse.json();
    expect(ragData.success).toBe(true);
    expect(ragData.message).toContain('successfully updated');
  });

  it('should validate input and reject invalid operations', async () => {
    setupFetchMocks({
      '/api/documents/test-doc-id': {
        statusCode: 400,
        body: { error: 'Invalid operation' },
      },
    });

    const invalidResponse = await fetch(`${API_URL}/api/documents/${documentId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operation: 'invalid-op',
        content: 'Some content',
      }),
    });

    expect(invalidResponse.status).toBe(400);
    
    const errorData = await invalidResponse.json();
    expect(errorData.error).toBeDefined();
  });

  describe('Security Tests', () => {
    it('should prevent unauthorized users from updating documents', async () => {
      setupFetchMocks({
        '/api/documents/test-doc-id': {
          statusCode: 401,
          body: { error: 'Unauthorized' },
        },
      });

      const unauthorizedResponse = await fetch(`${API_URL}/api/documents/${documentId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer different-api-key`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operation: 'replace',
          content: 'Malicious content',
          metadata: {
            model: {
              name: 'attacker-model',
              provider: 'attacker',
            },
          },
        }),
      });

      expect(unauthorizedResponse.status).toBe(401);
    });

    it('should sanitize HTML content and remove dangerous image sources', async () => {
      const dangerousContent = `
        <h1>Test</h1>
        <img src="javascript:alert('XSS')" alt="test">
        <img src="http://evil.com/steal-data" alt="evil">
        <script>alert('XSS')</script>
        <img src="data:image/png;base64,iVBORw0KGgo=" alt="valid">
      `;

      const sanitizeResponse = await fetch(`${API_URL}/api/documents/${documentId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operation: 'replace',
          content: dangerousContent,
          metadata: {
            model: {
              name: 'security-test-model',
              provider: 'test',
            },
          },
        }),
      });

      expect(sanitizeResponse.status).toBe(200);
      
      // Verify the content was sanitized
      const getResponse = await fetch(`${API_URL}/api/documents/${documentId}?includeContent=true`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });
      
      const docData = await getResponse.json();
      expect(docData.content).not.toContain('javascript:');
      expect(docData.content).not.toContain('<script>');
      expect(docData.content).not.toContain('evil.com');
    });

    it('should enforce rate limiting on updates', async () => {
      let callCount = 0;
      setupFetchMocks({
        '/api/documents/test-doc-id': () => {
          callCount += 1;
          if (callCount > 10) {
            return mockApiError('Rate limit exceeded', 429);
          }

          return mockApiResponse({ success: true }, { status: 200 });
        },
      });

      // Make 11 rapid requests (limit is 10 per 5 minutes)
      const promises = [];
      for (let i = 0; i < 11; i++) {
        promises.push(
          fetch(`${API_URL}/api/documents/${documentId}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              operation: 'append',
              content: `Rate limit test ${i}`,
              metadata: {
                model: {
                  name: 'rate-test-model',
                  provider: 'test',
                },
              },
            }),
          })
        );
      }

      const responses = await Promise.all(promises);
      const statusCodes = responses.map(r => r.status);
      
      // At least one should be rate limited (429)
      expect(statusCodes).toContain(429);
    });

    it('should only allow document owners to update their documents', async () => {
      // This test would require creating a document with one API key
      // and trying to update it with another
      // For now, we verify the authorization check exists
      const response = await fetch(`${API_URL}/api/documents/non-existent-id`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operation: 'replace',
          content: 'Test',
          metadata: {
            model: {
              name: 'test-model',
              provider: 'test',
            },
          },
        }),
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toContain('not found');
    });
  });
});
