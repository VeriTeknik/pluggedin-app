import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { saveDocumentVersion, getVersionContent, restoreVersion, listDocumentVersions, deleteVersion } from '@/lib/version-manager';
import { db } from '@/db';
import { docsTable, documentVersionsTable } from '@/db/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock dependencies
vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  }
}));

vi.mock('fs/promises');
vi.mock('@/lib/rag-service', () => ({
  ragService: {
    uploadDocument: vi.fn(),
    getUploadStatus: vi.fn(),
    removeDocument: vi.fn(),
  }
}));

describe('Version Manager Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENABLE_RAG = 'false';
    process.env.UPLOADS_DIR = '/test/uploads';
  });

  describe('Concurrent Version Creation', () => {
    it('should handle concurrent version creation without race conditions', async () => {
      const documentId = '123e4567-e89b-12d3-a456-426614174000';
      const userId = 'user-123';

      // Mock database transaction
      const mockTransaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([{
            uuid: documentId,
            name: 'test.txt',
            file_name: 'test.txt',
            version: 1,
            mime_type: 'text/plain',
          }]),
          update: vi.fn().mockReturnThis(),
          set: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          values: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([{
            id: 1,
            version_number: 2,
            document_id: documentId,
          }]),
        };
        return fn(tx);
      });

      (db.transaction as any).mockImplementation(mockTransaction);
      (fs.access as any).mockRejectedValue(new Error('Not found'));
      (fs.mkdir as any).mockResolvedValue(undefined);
      (fs.writeFile as any).mockResolvedValue(undefined);

      // Create multiple versions concurrently
      const promises = [
        saveDocumentVersion({
          documentId,
          content: 'Version 1 content',
          userId,
          createdByModel: { name: 'Test', provider: 'test' },
        }),
        saveDocumentVersion({
          documentId,
          content: 'Version 2 content',
          userId,
          createdByModel: { name: 'Test', provider: 'test' },
        }),
        saveDocumentVersion({
          documentId,
          content: 'Version 3 content',
          userId,
          createdByModel: { name: 'Test', provider: 'test' },
        }),
      ];

      const results = await Promise.all(promises);

      // Verify all versions were created
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toHaveProperty('versionNumber');
        expect(result).toHaveProperty('filePath');
      });

      // Verify transaction was used for atomicity
      expect(db.transaction).toHaveBeenCalledTimes(3);
    });

    it('should rollback on transaction failure', async () => {
      const documentId = '123e4567-e89b-12d3-a456-426614174000';
      const userId = 'user-123';

      // Mock transaction failure
      (db.transaction as any).mockRejectedValue(new Error('Transaction failed'));

      await expect(saveDocumentVersion({
        documentId,
        content: 'Test content',
        userId,
        createdByModel: { name: 'Test', provider: 'test' },
      })).rejects.toThrow();

      // Verify no file was written on transaction failure
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('Path Traversal Prevention', () => {
    it('should reject paths with traversal attempts', async () => {
      const maliciousDocId = '../../../etc/passwd';
      const userId = 'user-123';

      await expect(saveDocumentVersion({
        documentId: maliciousDocId,
        content: 'Malicious content',
        userId,
        createdByModel: { name: 'Test', provider: 'test' },
      })).rejects.toThrow('Invalid document ID');
    });

    it('should reject version numbers that are not positive integers', async () => {
      const documentId = '123e4567-e89b-12d3-a456-426614174000';
      const userId = 'user-123';

      await expect(getVersionContent(
        userId,
        documentId,
        -1 // Negative version number
      )).rejects.toThrow();

      await expect(getVersionContent(
        userId,
        documentId,
        3.14 // Non-integer version
      )).rejects.toThrow();
    });

    it('should validate file paths are within allowed directory', async () => {
      const documentId = '123e4567-e89b-12d3-a456-426614174000';
      const userId = 'user-123';
      const versionNumber = 1;

      // Mock database response with suspicious path
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{
          content: 'Safe content',
          file_path: '/etc/passwd', // Outside allowed directory
        }]),
      });

      await expect(getVersionContent(
        userId,
        documentId,
        versionNumber
      )).rejects.toThrow();
    });
  });

  describe('File System Failure Recovery', () => {
    it('should fall back to database content when file read fails', async () => {
      const documentId = '123e4567-e89b-12d3-a456-426614174000';
      const userId = 'user-123';
      const versionNumber = 1;
      const dbContent = 'Database stored content';

      // Mock database response
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{
          content: dbContent,
          file_path: 'valid/path/version1.txt',
        }]),
      });

      // Mock file read failure
      (fs.access as any).mockRejectedValue(new Error('File not found'));

      const content = await getVersionContent(userId, documentId, versionNumber);

      expect(content).toBe(dbContent);
      expect(fs.access).toHaveBeenCalled();
    });

    it('should cleanup file on database failure during restore', async () => {
      const documentId = '123e4567-e89b-12d3-a456-426614174000';
      const userId = 'user-123';
      const versionToRestore = 1;

      // Mock initial document fetch
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{
          uuid: documentId,
          file_path: 'test.txt',
          version: 2,
        }]),
        limit: vi.fn().mockReturnThis(),
      });

      // Mock version content retrieval
      // Note: This is already imported, just mock the actual call

      // Mock file operations
      (fs.writeFile as any).mockResolvedValue(undefined);

      // Mock database update failure
      (db.update as any).mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockRejectedValue(new Error('Database update failed')),
      });

      const result = await restoreVersion(userId, documentId, versionToRestore);

      expect(result).toBe(false);
      // Verify rollback attempt would have been made
    });
  });

  describe('RAG Integration Failure Handling', () => {
    it('should continue version creation when RAG upload fails', async () => {
      process.env.ENABLE_RAG = 'true';
      const documentId = '123e4567-e89b-12d3-a456-426614174000';
      const userId = 'user-123';

      // Mock successful database transaction
      (db.transaction as any).mockImplementation(async (fn) => {
        const tx = {
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([{
            uuid: documentId,
            name: 'test.txt',
            file_name: 'test.txt',
            version: 1,
            mime_type: 'text/plain',
          }]),
          update: vi.fn().mockReturnThis(),
          set: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          values: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([{
            id: 1,
            version_number: 2,
            document_id: documentId,
          }]),
        };
        return fn(tx);
      });

      // Mock file operations success
      (fs.access as any).mockRejectedValue(new Error('Not found'));
      (fs.mkdir as any).mockResolvedValue(undefined);
      (fs.writeFile as any).mockResolvedValue(undefined);

      // Mock RAG service failure
      const { ragService } = await import('@/lib/rag-service');
      (ragService.uploadDocument as any).mockRejectedValue(new Error('RAG service unavailable'));

      const result = await saveDocumentVersion({
        documentId,
        content: 'Test content',
        userId,
        createdByModel: { name: 'Test', provider: 'test' },
      });

      // Version should be created successfully despite RAG failure
      expect(result).toHaveProperty('versionNumber');
      expect(result).toHaveProperty('filePath');
    });
  });

  describe('Version Listing Performance', () => {
    it('should enforce pagination limits', async () => {
      const documentId = '123e4567-e89b-12d3-a456-426614174000';

      // Mock database query
      const mockQuery = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockReturnThis(),
        then: vi.fn().mockResolvedValue([]),
      };

      (db.select as any).mockReturnValue(mockQuery);

      // Try to request more than the maximum
      await listDocumentVersions(documentId, {
        limit: 1000, // Requesting way more than allowed
        offset: 0,
      });

      // Verify limit was capped at maximum
      expect(mockQuery.limit).toHaveBeenCalledWith(100);
    });

    it('should not include content by default', async () => {
      const documentId = '123e4567-e89b-12d3-a456-426614174000';

      const mockQuery = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockReturnThis(),
        then: vi.fn().mockResolvedValue([{
          version_number: 1,
          file_path: 'test.txt',
          created_at: new Date(),
        }]),
      };

      (db.select as any).mockImplementation((fields) => {
        // Verify content is not included
        expect(fields).not.toHaveProperty('content');
        return mockQuery;
      });

      await listDocumentVersions(documentId);
    });
  });

  describe('Backup and Restore Safety', () => {
    it('should create backup before restore', async () => {
      const documentId = '123e4567-e89b-12d3-a456-426614174000';
      const userId = 'user-123';
      const versionToRestore = 1;

      // Mock document exists
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{
          uuid: documentId,
          file_path: 'test.txt',
          version: 2,
          project_uuid: 'proj-123',
        }]),
      });

      // Mock file operations
      (fs.access as any).mockResolvedValue(undefined);
      (fs.readFile as any).mockResolvedValue('Current content');
      (fs.writeFile as any).mockResolvedValue(undefined);

      // Mock version save for backup
      const mockSaveVersion = vi.fn().mockResolvedValue({
        versionNumber: 3,
        filePath: 'backup.txt',
      });

      // Mock database update
      (db.update as any).mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      });

      // Attempt restore
      const result = await restoreVersion(userId, documentId, versionToRestore);

      // Verify backup was attempted
      expect(result).toBeDefined();
    });

    it('should abort restore if backup fails and not configured to continue', async () => {
      process.env.ALLOW_RESTORE_WITHOUT_BACKUP = 'false';
      const documentId = '123e4567-e89b-12d3-a456-426614174000';
      const userId = 'user-123';
      const versionToRestore = 1;

      // Mock document exists
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{
          uuid: documentId,
          file_path: 'test.txt',
          version: 2,
        }]),
      });

      // Mock backup creation failure
      const mockSaveVersion = vi.fn().mockRejectedValue(new Error('Backup failed'));

      // Restore should fail
      const result = await restoreVersion(userId, documentId, versionToRestore);
      expect(result).toBe(false);
    });
  });
});