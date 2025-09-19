/**
 * Version Manager - Centralized document versioning functionality
 * Handles creation, storage, and retrieval of document versions
 */

import { mkdir, writeFile, readFile, unlink, rename } from 'fs/promises';
import { join, extname, basename, dirname } from 'path';
import { existsSync } from 'fs';
import { db } from '@/db';
import { docsTable, documentVersionsTable } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { isPathWithinDirectory, sanitizeUserIdForFileSystem } from './security';
import { ragService } from './rag-service';

export interface VersionInfo {
  versionNumber: number;
  filePath: string;
  ragDocumentId?: string;
  createdAt: Date;
  createdByModel?: {
    name: string;
    provider: string;
    version?: string;
  };
  changeSummary?: string;
  isCurrent: boolean;
}

export interface CreateVersionOptions {
  documentId: string;
  content: string;
  userId: string;
  projectUuid?: string;
  createdByModel: {
    name: string;
    provider: string;
    version?: string;
  };
  changeSummary?: string;
  operation?: 'replace' | 'append' | 'prepend';
  previousContent?: string;
}

/**
 * Get the version directory path for a document
 */
export function getVersionDirectory(
  baseUploadDir: string,
  userId: string,
  documentId: string
): string {
  const safeUserId = sanitizeUserIdForFileSystem(userId);
  return join(baseUploadDir, safeUserId, 'versions', documentId);
}

/**
 * Generate a version filename
 */
export function generateVersionFilename(
  originalFilename: string,
  versionNumber: number
): string {
  const ext = extname(originalFilename);
  const baseName = basename(originalFilename, ext);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, -5);
  return `${baseName}_v${versionNumber}_${timestamp}${ext}`;
}

/**
 * Save a new document version
 */
export async function saveDocumentVersion(
  options: CreateVersionOptions
): Promise<VersionInfo> {
  const {
    documentId,
    content,
    userId,
    projectUuid,
    createdByModel,
    changeSummary,
    operation = 'replace',
    previousContent
  } = options;

  // Get the document details
  const [document] = await db
    .select()
    .from(docsTable)
    .where(eq(docsTable.uuid, documentId))
    .limit(1);

  if (!document) {
    throw new Error('Document not found');
  }

  // Determine base upload directory
  const baseUploadDir = process.env.UPLOADS_DIR || getDefaultUploadsDir();
  const versionDir = getVersionDirectory(baseUploadDir, userId, documentId);

  // Create version directory if it doesn't exist
  if (!existsSync(versionDir)) {
    await mkdir(versionDir, { recursive: true });
  }

  // Get the current version number
  const currentVersion = document.version || 1;
  const newVersionNumber = currentVersion + 1;

  // Generate version filename
  const versionFilename = generateVersionFilename(
    document.file_name,
    newVersionNumber
  );
  const versionFilePath = join(versionDir, versionFilename);

  // Validate the path is within allowed directory
  if (!isPathWithinDirectory(versionFilePath, baseUploadDir)) {
    console.error('Path traversal attempt in version creation:', versionFilePath);
    throw new Error('Invalid version file path');
  }

  // Additional validation to ensure filename is safe
  if (versionFilename.includes('../') || versionFilename.includes('..\\')) {
    console.error('Suspicious filename pattern:', versionFilename);
    throw new Error('Invalid version filename');
  }

  // Write the version file
  await writeFile(versionFilePath, content, 'utf-8');

  // Calculate content diff
  const contentDiff = calculateContentDiff(previousContent || '', content, operation);

  // Store the relative path for database
  const relativeVersionPath = `${sanitizeUserIdForFileSystem(userId)}/versions/${documentId}/${versionFilename}`;

  // Upload to RAG if enabled
  let ragDocumentId: string | null = null;
  if (process.env.ENABLE_RAG === 'true') {
    try {
      const ragIdentifier = projectUuid || userId;
      const file = new File([content], versionFilename, {
        type: document.mime_type
      });

      const uploadResult = await ragService.uploadDocument(file, ragIdentifier);

      if (uploadResult.success && uploadResult.upload_id) {
        // Poll for completion
        const maxAttempts = 30;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 1000));

          const statusResult = await ragService.getUploadStatus(
            uploadResult.upload_id,
            ragIdentifier
          );

          if (statusResult.progress?.status === 'completed' && statusResult.progress?.document_id) {
            ragDocumentId = statusResult.progress.document_id;
            break;
          } else if (statusResult.progress?.status === 'failed') {
            console.error('RAG upload failed for version');
            break;
          }
        }
      }
    } catch (ragError) {
      console.error('Failed to upload version to RAG:', ragError);
      // Continue without RAG - don't block version creation
    }
  }

  // Update all existing versions to not be current
  await db
    .update(documentVersionsTable)
    .set({ is_current: false })
    .where(eq(documentVersionsTable.document_id, documentId));

  // Create version record in database
  const [versionRecord] = await db
    .insert(documentVersionsTable)
    .values({
      document_id: documentId,
      version_number: newVersionNumber,
      content: content,
      file_path: relativeVersionPath,
      is_current: true,
      rag_document_id: ragDocumentId,
      created_by_model: createdByModel,
      change_summary: changeSummary || `${operation} operation by ${createdByModel.name}`,
      content_diff: contentDiff
    })
    .returning();

  return {
    versionNumber: versionRecord.version_number,
    filePath: versionRecord.file_path!,
    ragDocumentId: versionRecord.rag_document_id || undefined,
    createdAt: versionRecord.created_at,
    createdByModel: versionRecord.created_by_model as any,
    changeSummary: versionRecord.change_summary || undefined,
    isCurrent: versionRecord.is_current!
  };
}

/**
 * Get version content from file
 */
export async function getVersionContent(
  userId: string,
  documentId: string,
  versionNumber: number
): Promise<string | null> {
  try {
    // Get version record from database
    const [version] = await db
      .select()
      .from(documentVersionsTable)
      .where(
        and(
          eq(documentVersionsTable.document_id, documentId),
          eq(documentVersionsTable.version_number, versionNumber)
        )
      )
      .limit(1);

    if (!version || !version.file_path) {
      // Fallback to database content if file path not available
      return version?.content || null;
    }

    // Construct full file path
    const baseUploadDir = process.env.UPLOADS_DIR || getDefaultUploadsDir();
    const fullPath = join(baseUploadDir, version.file_path);

    // Re-validate path security after database retrieval to prevent path traversal
    if (!isPathWithinDirectory(fullPath, baseUploadDir)) {
      console.error('Path traversal attempt detected in version retrieval:', version.file_path);
      throw new Error('Invalid version file path');
    }

    // Additional validation: ensure the path doesn't contain suspicious patterns
    if (version.file_path.includes('../') || version.file_path.includes('..\\')) {
      console.error('Suspicious path pattern detected:', version.file_path);
      throw new Error('Invalid version file path');
    }

    // Read and return file content
    if (existsSync(fullPath)) {
      return await readFile(fullPath, 'utf-8');
    }

    // Fallback to database content if file doesn't exist
    return version.content;
  } catch (error) {
    console.error('Error retrieving version content:', error);
    return null;
  }
}

/**
 * Restore a previous version as the current version
 */
export async function restoreVersion(
  userId: string,
  documentId: string,
  versionNumber: number,
  restoredByModel?: {
    name: string;
    provider: string;
    version?: string;
  }
): Promise<boolean> {
  try {
    // Get the version to restore
    const versionContent = await getVersionContent(userId, documentId, versionNumber);
    if (!versionContent) {
      throw new Error('Version content not found');
    }

    // Get the document
    const [document] = await db
      .select()
      .from(docsTable)
      .where(eq(docsTable.uuid, documentId))
      .limit(1);

    if (!document) {
      throw new Error('Document not found');
    }

    // Create a new version with the restored content
    const restoredVersion = await saveDocumentVersion({
      documentId,
      content: versionContent,
      userId,
      projectUuid: document.project_uuid || undefined,
      createdByModel: restoredByModel || {
        name: 'System',
        provider: 'internal',
        version: '1.0'
      },
      changeSummary: `Restored from version ${versionNumber}`,
      operation: 'replace'
    });

    // Update the main document file
    const baseUploadDir = process.env.UPLOADS_DIR || getDefaultUploadsDir();
    const mainFilePath = document.file_path.startsWith('/')
      ? document.file_path
      : join(baseUploadDir, document.file_path);

    await writeFile(mainFilePath, versionContent, 'utf-8');

    // Update document record
    await db
      .update(docsTable)
      .set({
        version: restoredVersion.versionNumber,
        rag_document_id: restoredVersion.ragDocumentId || document.rag_document_id,
        updated_at: new Date()
      })
      .where(eq(docsTable.uuid, documentId));

    return true;
  } catch (error) {
    console.error('Error restoring version:', error);
    return false;
  }
}

/**
 * List all versions of a document
 */
export async function listDocumentVersions(
  documentId: string
): Promise<VersionInfo[]> {
  const versions = await db
    .select()
    .from(documentVersionsTable)
    .where(eq(documentVersionsTable.document_id, documentId))
    .orderBy(desc(documentVersionsTable.version_number));

  return versions.map(v => ({
    versionNumber: v.version_number,
    filePath: v.file_path || '',
    ragDocumentId: v.rag_document_id || undefined,
    createdAt: v.created_at,
    createdByModel: v.created_by_model as any,
    changeSummary: v.change_summary || undefined,
    isCurrent: v.is_current || false
  }));
}

/**
 * Delete a specific version (with safeguards)
 */
export async function deleteVersion(
  userId: string,
  documentId: string,
  versionNumber: number
): Promise<boolean> {
  try {
    // Don't allow deletion of the current version
    const [version] = await db
      .select()
      .from(documentVersionsTable)
      .where(
        and(
          eq(documentVersionsTable.document_id, documentId),
          eq(documentVersionsTable.version_number, versionNumber)
        )
      )
      .limit(1);

    if (!version) {
      return false;
    }

    if (version.is_current) {
      throw new Error('Cannot delete the current version');
    }

    // Delete the file if it exists
    if (version.file_path) {
      const baseUploadDir = process.env.UPLOADS_DIR || getDefaultUploadsDir();
      const fullPath = join(baseUploadDir, version.file_path);

      if (isPathWithinDirectory(fullPath, baseUploadDir) && existsSync(fullPath)) {
        await unlink(fullPath);
      }
    }

    // Delete from RAG if present
    if (version.rag_document_id && process.env.ENABLE_RAG === 'true') {
      try {
        const [document] = await db
          .select({ project_uuid: docsTable.project_uuid })
          .from(docsTable)
          .where(eq(docsTable.uuid, documentId))
          .limit(1);

        const ragIdentifier = document?.project_uuid || userId;
        await ragService.removeDocument(version.rag_document_id, ragIdentifier);
      } catch (ragError) {
        console.error('Failed to remove version from RAG:', ragError);
      }
    }

    // Delete from database
    await db
      .delete(documentVersionsTable)
      .where(
        and(
          eq(documentVersionsTable.document_id, documentId),
          eq(documentVersionsTable.version_number, versionNumber)
        )
      );

    return true;
  } catch (error) {
    console.error('Error deleting version:', error);
    return false;
  }
}

/**
 * Calculate content diff between versions
 */
function calculateContentDiff(
  oldContent: string,
  newContent: string,
  operation: 'replace' | 'append' | 'prepend'
): any {
  const oldSize = Buffer.byteLength(oldContent, 'utf-8');
  const newSize = Buffer.byteLength(newContent, 'utf-8');

  switch (operation) {
    case 'replace':
      return {
        additions: newSize,
        deletions: oldSize,
        changes: [{ type: 'replace', content: `Replaced ${oldSize} bytes with ${newSize} bytes` }]
      };
    case 'append':
      return {
        additions: newSize - oldSize,
        deletions: 0,
        changes: [{ type: 'append', content: `Added ${newSize - oldSize} bytes` }]
      };
    case 'prepend':
      return {
        additions: newSize - oldSize,
        deletions: 0,
        changes: [{ type: 'prepend', content: `Prepended ${newSize - oldSize} bytes` }]
      };
    default:
      return {
        additions: Math.max(0, newSize - oldSize),
        deletions: Math.max(0, oldSize - newSize)
      };
  }
}

/**
 * Get default uploads directory based on platform
 */
function getDefaultUploadsDir(): string {
  if (process.platform === 'darwin') {
    return join(process.cwd(), 'uploads');
  } else if (process.platform === 'win32') {
    return join(process.env.TEMP || 'C:\\temp', 'pluggedin-uploads');
  } else {
    return '/home/pluggedin/uploads';
  }
}

/**
 * Migrate existing versions to use file storage
 * This function creates version files for existing database-only versions
 */
export async function migrateExistingVersions(userId: string): Promise<{
  success: boolean;
  migrated: number;
  failed: number;
}> {
  try {
    // Get all versions that don't have file_path
    const versionsToMigrate = await db
      .select()
      .from(documentVersionsTable);

    let migrated = 0;
    let failed = 0;

    // Filter for versions without file_path
    const versionsNeedingMigration = versionsToMigrate.filter(v => !v.file_path);

    for (const version of versionsNeedingMigration) {
      try {
        // Get document info
        const [document] = await db
          .select()
          .from(docsTable)
          .where(eq(docsTable.uuid, version.document_id))
          .limit(1);

        if (!document || document.user_id !== userId) {
          failed++;
          continue;
        }

        // Create version file
        const baseUploadDir = process.env.UPLOADS_DIR || getDefaultUploadsDir();
        const versionDir = getVersionDirectory(baseUploadDir, userId, version.document_id);

        if (!existsSync(versionDir)) {
          await mkdir(versionDir, { recursive: true });
        }

        const versionFilename = generateVersionFilename(
          document.file_name,
          version.version_number
        );
        const versionFilePath = join(versionDir, versionFilename);

        // Write version content to file
        await writeFile(versionFilePath, version.content, 'utf-8');

        // Update database with file path
        const relativeVersionPath = `${sanitizeUserIdForFileSystem(userId)}/versions/${version.document_id}/${versionFilename}`;

        await db
          .update(documentVersionsTable)
          .set({ file_path: relativeVersionPath })
          .where(eq(documentVersionsTable.id, version.id));

        migrated++;
      } catch (error) {
        console.error(`Failed to migrate version ${version.id}:`, error);
        failed++;
      }
    }

    return {
      success: true,
      migrated,
      failed
    };
  } catch (error) {
    console.error('Error migrating versions:', error);
    return {
      success: false,
      migrated: 0,
      failed: 0
    };
  }
}