/**
 * Extract text content from uploaded files for RAG processing
 * @param file - The uploaded file
 * @param description - Optional description provided by user
 * @returns Promise<string> - Extracted text content
 */
export async function extractTextContent(file: File, description: string | null): Promise<string> {
  try {
    if (file.type.includes('text') || file.type.includes('markdown')) {
      return await file.text();
    } else if (file.type.includes('pdf')) {
      // For PDF, you might want to use a PDF parsing library
      // For now, we'll just use the filename and description
      return `PDF Document: ${file.name}\nDescription: ${description || 'No description'}`;
    } else {
      return `Document: ${file.name}\nType: ${file.type}\nDescription: ${description || 'No description'}`;
    }
  } catch (parseError) {
    console.warn('Failed to parse file content for RAG:', parseError);
    return `Document: ${file.name}\nDescription: ${description || 'No description'}`;
  }
} 