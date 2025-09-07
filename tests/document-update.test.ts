import { describe, it, expect, beforeAll } from 'vitest';

describe('Document Update API', () => {
  const API_URL = 'http://localhost:12005';
  let apiKey: string;
  let documentId: string;

  beforeAll(() => {
    // Use test API key from environment
    apiKey = process.env.TEST_API_KEY || 'test-api-key';
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
});