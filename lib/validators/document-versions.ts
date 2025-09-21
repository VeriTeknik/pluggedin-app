import { z } from 'zod';

/**
 * Schema for validating document version content request
 */
export const getDocumentVersionContentSchema = z.object({
  documentId: z.string().uuid('Invalid document ID format'),
  versionNumber: z.number().int().positive('Version number must be positive')
});

/**
 * Validate document version content request
 */
export function validateGetDocumentVersionRequest(input: unknown) {
  return getDocumentVersionContentSchema.parse(input);
}