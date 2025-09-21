/**
 * Version Manager - Centralized document versioning functionality
 * Handles creation, storage, and retrieval of document versions
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import { access, constants, mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { basename, extname } from 'path';

import { db } from '@/db';
import { docsTable, documentVersionsTable } from '@/db/schema';

import { validateDocumentId, validateFilename, validateUserId, validateVersionNumber } from './path-validation';
import { ragService } from './rag-service';
import {
  buildSecureVersionDir,
  buildSecureVersionFilePath,
  extractRelativePath,
  getSecureBaseUploadDir,
  validateStoredPath
} from './secure-path-builder';

export interface VersionInfo {
  versionNumber: number;
  filePath: string;
  fileWritten: boolean; // Indicates if the file was successfully written to disk
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
  // Use secure path builder which validates all inputs
  return buildSecureVersionDir(baseUploadDir, userId, documentId);
}

/**
 * Generate a version filename
 */
export function generateVersionFilename(
  originalFilename: string,
  versionNumber: number
): string {
  // Validate inputs
  const validatedFilename = validateFilename(originalFilename);
  const validatedVersion = validateVersionNumber(versionNumber);

  const ext = extname(validatedFilename);
  const baseName = basename(validatedFilename, ext);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, -5);
  return `${baseName}_v${validatedVersion}_${timestamp}${ext}`;
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

  // Pre-validate all inputs BEFORE any operations
  const validatedDocumentId = validateDocumentId(documentId);
  const validatedUserId = validateUserId(userId);

  // Calculate content diff early
  const contentDiff = calculateContentDiff(previousContent || '', content, operation);

  // ALL database operations MUST be in ONE ATOMIC transaction with row locking
  const transactionResult = await db.transaction(async (tx) => {
    // Get the document with FOR UPDATE row lock to prevent concurrent modifications
    // This ensures only one transaction can modify this document at a time
    const documentResult = await tx.execute(
      sql`SELECT * FROM ${docsTable} WHERE uuid = ${validatedDocumentId} FOR UPDATE`
    );

    const document = documentResult.rows[0] as typeof docsTable.$inferSelect | undefined;

    if (!document) {
      throw new Error('Document not found');
    }

    // Verify version is initialized
    if (!document.version) {
      throw new Error('Document version not initialized');
    }

    // Calculate new version number
    const newVersionNumber = document.version + 1;

    // Update document version number to claim it
    await tx
      .update(docsTable)
      .set({ version: newVersionNumber })
      .where(eq(docsTable.uuid, validatedDocumentId));

    // Prepare file paths using secure path builder
    const baseUploadDir = getSecureBaseUploadDir();
    const versionDir = buildSecureVersionDir(baseUploadDir, validatedUserId, validatedDocumentId);
    const versionFilename = generateVersionFilename(document.file_name, newVersionNumber);
    const versionFilePath = buildSecureVersionFilePath(versionDir, versionFilename);
    const relativeVersionPath = extractRelativePath(versionFilePath, baseUploadDir);

    // Path security is already validated by buildSecureVersionFilePath

    // Update all existing versions to not be current
    await tx
      .update(documentVersionsTable)
      .set({ is_current: false })
      .where(eq(documentVersionsTable.document_id, validatedDocumentId));

    // Create new version record IN THE SAME TRANSACTION
    const [versionRecord] = await tx
      .insert(documentVersionsTable)
      .values({
        document_id: validatedDocumentId,
        version_number: newVersionNumber,
        content: content, // Store in DB for reliability
        file_path: relativeVersionPath,
        is_current: true,
        rag_document_id: null, // Will update later if RAG succeeds
        created_by_model: createdByModel,
        change_summary: changeSummary || `${operation} operation by ${createdByModel.name}`,
        content_diff: contentDiff
      })
      .returning();

    // Return all necessary data for post-transaction operations
    return {
      versionRecord,
      versionFilePath,
      versionDir,
      baseUploadDir,
      document,
      newVersionNumber
    };
  });

  // STEP 2: Write file AFTER successful transaction (non-critical)
  // Database is already consistent, file write is best-effort
  let fileWritten = false;
  try {
    // Create directory if needed
    try {
      await access(transactionResult.versionDir, constants.F_OK);
    } catch {
      await mkdir(transactionResult.versionDir, { recursive: true });
    }

    // Write the version file
    await writeFile(transactionResult.versionFilePath, content, 'utf-8');
    fileWritten = true;
  } catch (fileError) {
    console.error('[Version Manager] Failed to write version file (non-critical)', {
      error: fileError instanceof Error ? fileError.message : String(fileError),
      documentId: validatedDocumentId,
      versionNumber: transactionResult.newVersionNumber,
      filePath: transactionResult.versionFilePath,
      fallback: 'Version content stored in database'
    });
    // Continue - we have the content in the database
  }

  // STEP 3: Upload to RAG if enabled (non-critical, async)
  let ragDocumentId: string | null = null;
  if (process.env.ENABLE_RAG === 'true' && fileWritten) {
    try {
      const ragIdentifier = projectUuid || validatedUserId;
      const versionFilename = basename(transactionResult.versionFilePath);

      // Create a proper Blob/File object for Node.js environment
      const contentBuffer = Buffer.from(content, 'utf-8');
      const blob = new Blob([contentBuffer], { type: transactionResult.document.mime_type });

      // Convert Blob to File with proper name
      const fileData = new File([blob], versionFilename, {
        type: transactionResult.document.mime_type,
        lastModified: Date.now()
      });

      const uploadResult = await ragService.uploadDocument(fileData, ragIdentifier);

      if (uploadResult.success && uploadResult.upload_id) {
        // Poll for completion with exponential backoff (max 30 seconds total)
        const maxAttempts = parseInt(process.env.RAG_POLL_MAX_ATTEMPTS || '10'); // Reduced from 30
        const initialInterval = parseInt(process.env.RAG_POLL_INITIAL_INTERVAL_MS || '500'); // Start faster
        const maxInterval = parseInt(process.env.RAG_POLL_MAX_INTERVAL_MS || '5000'); // Cap at 5 seconds
        const backoffMultiplier = parseFloat(process.env.RAG_POLL_BACKOFF_MULTIPLIER || '1.5');

        const startTime = Date.now();
        const maxTotalTime = 30000; // Hard limit: 30 seconds total

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          // Check if we've exceeded total time limit
          if (Date.now() - startTime > maxTotalTime) {
            console.warn('RAG polling timeout exceeded, continuing without RAG');
            break;
          }

          // Calculate exponential backoff with jitter
          const baseDelay = Math.min(initialInterval * Math.pow(backoffMultiplier, attempt), maxInterval);
          const jitter = Math.random() * 0.3 * baseDelay; // Add 0-30% jitter
          const delay = Math.floor(baseDelay + jitter);

          await new Promise(resolve => setTimeout(resolve, delay));

          const statusResult = await ragService.getUploadStatus(
            uploadResult.upload_id,
            ragIdentifier
          );

          if (statusResult.progress?.status === 'completed' && statusResult.progress?.document_id) {
            ragDocumentId = statusResult.progress.document_id;
            console.log(`RAG upload completed after ${attempt + 1} attempts`);
            break;
          } else if (statusResult.progress?.status === 'failed') {
            console.error('RAG upload failed for version');
            break;
          }

          // Log progress for monitoring
          if (attempt > 0 && attempt % 5 === 0) {
            console.log(`RAG upload still processing, attempt ${attempt + 1}/${maxAttempts}, next delay: ${delay}ms`);
          }
        }
      }
    } catch (ragError) {
      console.error('[Version Manager] Failed to upload version to RAG', {
        error: ragError instanceof Error ? ragError.message : String(ragError),
        documentId: validatedDocumentId,
        versionNumber: transactionResult.newVersionNumber,
        fallback: 'Version created without RAG integration'
      });
      // Continue without RAG - don't block version creation
    }
  }

  // Update RAG document ID if successful (non-critical)
  if (ragDocumentId) {
    try {
      await db
        .update(documentVersionsTable)
        .set({ rag_document_id: ragDocumentId })
        .where(
          and(
            eq(documentVersionsTable.document_id, validatedDocumentId),
            eq(documentVersionsTable.version_number, transactionResult.newVersionNumber)
          )
        );
    } catch (updateError) {
      console.error('Failed to update RAG document ID:', updateError);
    }
  }

  // Return the version info with file write status
  return {
    versionNumber: transactionResult.versionRecord.version_number,
    filePath: transactionResult.versionRecord.file_path || '',
    fileWritten, // Include the file write status
    ragDocumentId: ragDocumentId || undefined,
    createdAt: transactionResult.versionRecord.created_at,
    createdByModel: transactionResult.versionRecord.created_by_model as any,
    changeSummary: transactionResult.versionRecord.change_summary || undefined,
    isCurrent: true
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
  // Initialize validated values outside try block for error handling
  let validatedDocumentId: string = documentId;
  let validatedVersion: number = versionNumber;

  try {
    // Pre-validate inputs
    validatedDocumentId = validateDocumentId(documentId);
    const _validatedUserId = validateUserId(userId);
    validatedVersion = validateVersionNumber(versionNumber);
    // Get version record from database
    const [version] = await db
      .select()
      .from(documentVersionsTable)
      .where(
        and(
          eq(documentVersionsTable.document_id, validatedDocumentId),
          eq(documentVersionsTable.version_number, validatedVersion)
        )
      )
      .limit(1);

    if (!version || !version.file_path) {
      // Fallback to database content if file path not available
      return version?.content || null;
    }

    // Construct and validate full file path using secure path builder
    const baseUploadDir = getSecureBaseUploadDir();
    // validateStoredPath validates and normalizes the path from database
    const fullPath = validateStoredPath(version.file_path, baseUploadDir);

    // Check if file exists using async method
    try {
      // Security: fullPath is validated by validateStoredPath above
      // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
      await access(fullPath, constants.F_OK);
      return await readFile(fullPath, 'utf-8');
    } catch {
      // File doesn't exist, fall through to database content
    }

    // Fallback to database content if file doesn't exist
    console.warn('[Version Manager] Version fallback activated', {
      documentId: validatedDocumentId,
      versionNumber: validatedVersion,
      fallbackSource: 'database',
      reason: 'File not accessible or does not exist',
      timestamp: new Date().toISOString()
    });
    return version.content;
  } catch (error) {
    console.error('[Version Manager] Error retrieving version content', {
      error: error instanceof Error ? error.message : String(error),
      documentId: validatedDocumentId,
      versionNumber: validatedVersion,
      fallback: 'Returning null - version unavailable'
    });
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
    // Pre-validate inputs
    const validatedDocumentId = validateDocumentId(documentId);
    const validatedUserId = validateUserId(userId);
    const validatedVersion = validateVersionNumber(versionNumber);

    // Get the version to restore
    const versionContent = await getVersionContent(validatedUserId, validatedDocumentId, validatedVersion);
    if (!versionContent) {
      throw new Error('Version content not found');
    }

    // Get the document
    const [document] = await db
      .select()
      .from(docsTable)
      .where(eq(docsTable.uuid, validatedDocumentId))
      .limit(1);

    if (!document) {
      throw new Error('Document not found');
    }

    // Create a backup of the current version before restoring
    const baseUploadDir = getSecureBaseUploadDir();

    // Validate document file path using secure path builder
    if (!document.file_path) {
      throw new Error('Document file path not found');
    }

    // validateStoredPath handles all path validation and security checks
    const mainFilePath = validateStoredPath(document.file_path, baseUploadDir);

    // Read current content for backup
    let currentContent: string;
    try {
      await access(mainFilePath, constants.F_OK);
      currentContent = await readFile(mainFilePath, 'utf-8');
    } catch {
      // If main file doesn't exist, try to get the last version's content
      const lastVersion = await getVersionContent(validatedUserId, validatedDocumentId, document.version || 0);
      currentContent = lastVersion || '';
      console.log('[Version Manager] Main file not found, using version history for backup', {
        documentId: validatedDocumentId,
        lastKnownVersion: document.version || 0,
        fallbackSource: 'version_history',
        operation: 'restore_backup'
      });
    }

    // Create a backup version of the current state
    let backupVersion: VersionInfo | null = null;
    if (currentContent) {
      try {
        backupVersion = await saveDocumentVersion({
          documentId: validatedDocumentId,
          content: currentContent,
          userId: validatedUserId,
          projectUuid: document.project_uuid || undefined,
          createdByModel: {
            name: 'System',
            provider: 'internal',
            version: '1.0'
          },
          changeSummary: `Backup before restoring version ${validatedVersion}`,
          operation: 'replace',
          previousContent: currentContent
        });
        console.log(`Created backup version ${backupVersion.versionNumber} before restore`);
      } catch (backupError) {
        console.error('[Version Manager] Failed to create backup version', {
          error: backupError instanceof Error ? backupError.message : String(backupError),
          documentId: validatedDocumentId,
          targetVersion: validatedVersion,
          fallback: process.env.ALLOW_RESTORE_WITHOUT_BACKUP === 'true' ? 'Continuing without backup' : 'Aborting restore operation'
        });
        // Optionally continue without backup if explicitly configured
        if (process.env.ALLOW_RESTORE_WITHOUT_BACKUP !== 'true') {
          throw new Error('Failed to create backup before restore - operation aborted for safety');
        }
      }
    }

    // Create a new version with the restored content
    let restoredVersion: VersionInfo;
    try {
      restoredVersion = await saveDocumentVersion({
        documentId: validatedDocumentId,
        content: versionContent,
        userId: validatedUserId,
        projectUuid: document.project_uuid || undefined,
        createdByModel: restoredByModel || {
          name: 'System',
          provider: 'internal',
          version: '1.0'
        },
        changeSummary: `Restored from version ${validatedVersion}`,
        operation: 'replace',
        previousContent: currentContent
      });
      console.log(`Created restored version ${restoredVersion.versionNumber} from version ${validatedVersion}`);
    } catch (restoreError) {
      console.error('Failed to create restored version:', restoreError);
      throw new Error(`Failed to restore version: ${restoreError instanceof Error ? restoreError.message : 'Unknown error'}`);
    }

    // Update the main document file with rollback capability
    try {
      await writeFile(mainFilePath, versionContent, 'utf-8');
    } catch (writeError) {
      console.error('Failed to write restored content to main file:', writeError);
      // Attempt to rollback to the backup if it exists
      if (backupVersion && currentContent) {
        try {
          await writeFile(mainFilePath, currentContent, 'utf-8');
          console.log('Rolled back main file to backup content after write failure');
        } catch (rollbackError) {
          console.error('Failed to rollback main file:', rollbackError);
        }
      }
      throw new Error('Failed to write restored content to file');
    }

    // Update document record
    await db
      .update(docsTable)
      .set({
        version: restoredVersion.versionNumber,
        rag_document_id: restoredVersion.ragDocumentId || document.rag_document_id,
        updated_at: new Date()
      })
      .where(eq(docsTable.uuid, validatedDocumentId));

    return true;
  } catch (error) {
    console.error('Error restoring version:', error);
    return false;
  }
}

/**
 * List all versions of a document (optimized to exclude content)
 */
export async function listDocumentVersions(
  documentId: string,
  options?: {
    limit?: number;
    offset?: number;
    includeContent?: boolean;
  }
): Promise<VersionInfo[]> {
  // Pre-validate inputs
  const validatedDocumentId = validateDocumentId(documentId);

  // Apply reasonable limits to prevent memory issues
  const maxLimit = 100;
  const requestedLimit = options?.limit || 50; // Default to 50 instead of 100
  const limit = Math.min(requestedLimit, maxLimit); // Cap at maximum
  const offset = options?.offset || 0;
  const includeContent = options?.includeContent || false;

  if (requestedLimit > maxLimit) {
    console.warn('[Version Manager] Version listing limit exceeded', {
      requested: requestedLimit,
      applied: limit,
      documentId: validatedDocumentId
    });
  }

  // Build query - exclude content by default for performance
  const query = db
    .select({
      version_number: documentVersionsTable.version_number,
      file_path: documentVersionsTable.file_path,
      rag_document_id: documentVersionsTable.rag_document_id,
      created_at: documentVersionsTable.created_at,
      created_by_model: documentVersionsTable.created_by_model,
      change_summary: documentVersionsTable.change_summary,
      is_current: documentVersionsTable.is_current,
      // Only include content if explicitly requested
      ...(includeContent ? { content: documentVersionsTable.content } : {})
    })
    .from(documentVersionsTable)
    .where(eq(documentVersionsTable.document_id, validatedDocumentId))
    .orderBy(desc(documentVersionsTable.version_number))
    .limit(limit)
    .offset(offset);

  const versions = await query;

  return versions.map(v => ({
    versionNumber: v.version_number,
    filePath: v.file_path || '',
    fileWritten: !!v.file_path, // File is considered written if path exists
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
    // Pre-validate inputs
    const validatedDocumentId = validateDocumentId(documentId);
    const validatedUserId = validateUserId(userId);
    const validatedVersion = validateVersionNumber(versionNumber);

    // Don't allow deletion of the current version
    const [version] = await db
      .select()
      .from(documentVersionsTable)
      .where(
        and(
          eq(documentVersionsTable.document_id, validatedDocumentId),
          eq(documentVersionsTable.version_number, validatedVersion)
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
      const baseUploadDir = getSecureBaseUploadDir();
      try {
        // validateStoredPath ensures the path is safe
        const fullPath = validateStoredPath(version.file_path, baseUploadDir);
        await access(fullPath, constants.F_OK);
        await unlink(fullPath);
      } catch {
        // File doesn't exist or invalid path, continue
      }
    }

    // Delete from RAG if present
    if (version.rag_document_id && process.env.ENABLE_RAG === 'true') {
      try {
        const [document] = await db
          .select({ project_uuid: docsTable.project_uuid })
          .from(docsTable)
          .where(eq(docsTable.uuid, validatedDocumentId))
          .limit(1);

        const ragIdentifier = document?.project_uuid || validatedUserId;
        await ragService.removeDocument(version.rag_document_id, ragIdentifier);
      } catch (ragError) {
        console.error('[Version Manager] Failed to remove version from RAG', {
          error: ragError instanceof Error ? ragError.message : String(ragError),
          documentId: validatedDocumentId,
          versionNumber: validatedVersion,
          ragDocumentId: version.rag_document_id,
          fallback: 'Version deleted from database but may remain in RAG'
        });
      }
    }

    // Delete from database
    await db
      .delete(documentVersionsTable)
      .where(
        and(
          eq(documentVersionsTable.document_id, validatedDocumentId),
          eq(documentVersionsTable.version_number, validatedVersion)
        )
      );

    return true;
  } catch (error) {
    console.error('[Version Manager] Error deleting version', {
      error: error instanceof Error ? error.message : String(error),
      documentId,
      versionNumber,
      fallback: 'Version deletion failed - data remains intact'
    });
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
 * DEPRECATED: Use getSecureBaseUploadDir() from secure-path-builder instead
 */
function getDefaultUploadsDir(): string {
  return getSecureBaseUploadDir();
}

/**
 * Helper function to update version's RAG ID asynchronously
 */
async function _updateVersionRagId(
  documentId: string,
  versionNumber: number,
  ragDocumentId: string
): Promise<void> {
  try {
    await db
      .update(documentVersionsTable)
      .set({ rag_document_id: ragDocumentId })
      .where(
        and(
          eq(documentVersionsTable.document_id, documentId),
          eq(documentVersionsTable.version_number, versionNumber)
        )
      );
    console.log('[Version Manager] Updated version RAG ID asynchronously', {
      documentId,
      versionNumber,
      ragDocumentId
    });
  } catch (error) {
    console.error('[Version Manager] Failed to update version RAG ID', {
      error: error instanceof Error ? error.message : String(error),
      documentId,
      versionNumber,
      ragDocumentId
    });
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
  // Pre-validate inputs outside try for error handling
  const validatedUserId = validateUserId(userId);

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

        if (!document || document.user_id !== validatedUserId) {
          failed++;
          continue;
        }

        // Validate document ID before using it
        const validatedDocId = validateDocumentId(version.document_id);

        // Create version file
        const baseUploadDir = process.env.UPLOADS_DIR || getDefaultUploadsDir();
        const versionDir = getVersionDirectory(baseUploadDir, validatedUserId, validatedDocId);

        // Check if directory exists using async method
        try {
          await access(versionDir, constants.F_OK);
        } catch {
          await mkdir(versionDir, { recursive: true });
        }

        const versionFilename = generateVersionFilename(
          document.file_name,
          version.version_number
        );
        const versionFilePath = buildSecureVersionFilePath(versionDir, versionFilename);

        // Write version content to file
        await writeFile(versionFilePath, version.content, 'utf-8');

        // Update database with file path
        const relativeVersionPath = extractRelativePath(versionFilePath, getSecureBaseUploadDir());

        await db
          .update(documentVersionsTable)
          .set({ file_path: relativeVersionPath })
          .where(eq(documentVersionsTable.id, version.id));

        migrated++;
      } catch (error) {
        console.error('[Version Manager] Failed to migrate version', {
          error: error instanceof Error ? error.message : String(error),
          versionId: version.id,
          documentId: version.document_id,
          fallback: 'Version remains in database without file backup'
        });
        failed++;
      }
    }

    return {
      success: true,
      migrated,
      failed
    };
  } catch (error) {
    console.error('[Version Manager] Error migrating versions', {
      error: error instanceof Error ? error.message : String(error),
      userId: validatedUserId,
      fallback: 'Migration aborted - existing data unchanged'
    });
    return {
      success: false,
      migrated: 0,
      failed: 0
    };
  }
}