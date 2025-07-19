import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';

// Test configuration
const API_BASE_URL = process.env.TEST_API_URL || 'http://localhost:12005';
const API_KEY = process.env.TEST_API_KEY || 'test-api-key';

describe('Document Create-Search-Retrieve Flow', () => {
  let documentId: string;
  const testDocumentTitle = `Test Document ${randomUUID()}`;
  const testDocumentContent = 'This is a test document for integration testing. Hello world!';

  beforeAll(() => {
    if (!process.env.TEST_API_KEY) {
      console.warn('TEST_API_KEY not set, skipping integration tests');
    }
  });

  it('should create a document via AI endpoint', async () => {
    if (!process.env.TEST_API_KEY) {
      return;
    }

    const response = await fetch(`${API_BASE_URL}/api/documents/ai`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: testDocumentTitle,
        content: testDocumentContent,
        format: 'text',
        tags: ['test', 'integration'],
        metadata: {
          model: {
            name: 'test-model',
            provider: 'test-provider',
            version: '1.0'
          }
        }
      })
    });

    expect(response.ok).toBe(true);
    
    const data = await response.json();
    expect(data.id).toBeDefined();
    expect(data.title).toBe(testDocumentTitle);
    
    documentId = data.id;
    
    // Wait a moment for indexing
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  it('should find the document via search', async () => {
    if (!process.env.TEST_API_KEY || !documentId) {
      return;
    }

    const response = await fetch(`${API_BASE_URL}/api/documents/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: 'world',
        filters: {
          source: 'ai_generated'
        },
        limit: 10
      })
    });

    expect(response.ok).toBe(true);
    
    const data = await response.json();
    expect(data.results).toBeDefined();
    expect(Array.isArray(data.results)).toBe(true);
    
    // Find our test document
    const foundDocument = data.results.find((doc: any) => doc.id === documentId);
    expect(foundDocument).toBeDefined();
    expect(foundDocument.title).toBe(testDocumentTitle);
    expect(foundDocument.source).toBe('ai_generated');
  });

  it('should retrieve the document by ID', async () => {
    if (!process.env.TEST_API_KEY || !documentId) {
      return;
    }

    const response = await fetch(`${API_BASE_URL}/api/documents/${documentId}?includeContent=true`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    });

    expect(response.ok).toBe(true);
    
    const data = await response.json();
    expect(data.id).toBe(documentId);
    expect(data.title).toBe(testDocumentTitle);
    expect(data.content).toBeDefined();
    expect(data.source).toBe('ai_generated');
    expect(data.aiMetadata).toBeDefined();
    expect(data.aiMetadata.model.name).toBe('test-model');
  });

  it('should handle document not found error correctly', async () => {
    if (!process.env.TEST_API_KEY) {
      return;
    }

    const fakeId = randomUUID();
    const response = await fetch(`${API_BASE_URL}/api/documents/${fakeId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    });

    expect(response.status).toBe(404);
    
    const data = await response.json();
    expect(data.error).toBeDefined();
    expect(data.details).toBeDefined();
  });

  afterAll(async () => {
    // Optionally clean up test document
    // Note: There's no delete endpoint currently, so documents will remain
  });
});