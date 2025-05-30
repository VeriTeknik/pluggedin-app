import { useCallback } from 'react';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';

import { getDocs, createDoc, deleteDoc } from '@/app/actions/docs';
import { useToast } from './use-toast';
import type { Doc, CreateDocRequest } from '@/types/docs';

export function useDocs() {
  const { data: session } = useSession();
  const { toast } = useToast();

  const {
    data: docsResponse,
    error,
    mutate,
    isLoading,
  } = useSWR(
    session?.user?.id ? ['docs', session.user.id] : null,
    () => session?.user?.id ? getDocs(session.user.id) : null,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30000, // 30 seconds
    }
  );

  const docs: Doc[] = docsResponse?.success ? docsResponse.docs || [] : [];

  const uploadDoc = useCallback(
    async (request: CreateDocRequest) => {
      if (!session?.user?.id) {
        throw new Error('Not authenticated');
      }

      const formData = new FormData();
      formData.append('file', request.file);
      formData.append('name', request.name);
      if (request.description) {
        formData.append('description', request.description);
      }
      if (request.tags && request.tags.length > 0) {
        formData.append('tags', request.tags.join(','));
      }

      const result = await createDoc(session.user.id, formData);
      
      if (result.success) {
        // Optimistically update the cache
        await mutate();
        
        // First notification: Document uploaded
        toast({
          title: 'Document Uploaded',
          description: 'Document saved successfully. RAG processing in progress...',
        });
        
        // Second notification: RAG processing result
        if (result.ragProcessed) {
          setTimeout(() => {
            toast({
              title: 'RAG Processing Complete',
              description: 'Document is now available for AI queries!',
            });
          }, 500); // Small delay so user can see both notifications
        } else if (result.ragError) {
          setTimeout(() => {
            toast({
              title: 'RAG Processing Failed',
              description: `Warning: ${result.ragError}. Document saved but not available for AI queries.`,
              variant: 'destructive',
            });
          }, 500);
        }
        
        return result.doc;
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to upload document',
          variant: 'destructive',
        });
        throw new Error(result.error || 'Failed to upload document');
      }
    },
    [session?.user?.id, mutate, toast]
  );

  const removeDoc = useCallback(
    async (docUuid: string) => {
      if (!session?.user?.id) {
        throw new Error('Not authenticated');
      }

      const result = await deleteDoc(session.user.id, docUuid);
      
      if (result.success) {
        // Optimistically update the cache
        await mutate();
        toast({
          title: 'Success',
          description: 'Document deleted successfully',
        });
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to delete document',
          variant: 'destructive',
        });
        throw new Error(result.error || 'Failed to delete document');
      }
    },
    [session?.user?.id, mutate, toast]
  );

  const downloadDoc = useCallback(
    (doc: Doc) => {
      if (!session?.user?.id) {
        throw new Error('Not authenticated');
      }

      // Create download URL (no need for profileUuid parameter anymore)
      const downloadUrl = `/api/docs/download/${doc.uuid}`;
      
      // Create a temporary link and trigger download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = doc.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    [session?.user?.id]
  );

  return {
    docs,
    isLoading,
    error: error || (docsResponse && !docsResponse.success ? docsResponse.error : null),
    uploadDoc,
    removeDoc,
    downloadDoc,
    mutate,
  };
} 