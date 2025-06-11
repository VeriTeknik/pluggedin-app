import { useCallback } from 'react';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';

import { getDocs, createDoc, deleteDoc } from '@/app/actions/docs';
import { useToast } from './use-toast';
import type { Doc } from '@/types/docs';
import { useProfiles } from '@/hooks/use-profiles';

export function useDocs() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const { currentProfile } = useProfiles();

  const {
    data: docsResponse,
    error,
    mutate,
    isLoading,
  } = useSWR(
    session?.user?.id ? ['docs', session.user.id, currentProfile?.uuid] : null,
    async () => {
      if (!session?.user?.id) {
        throw new Error('Not authenticated');
      }
      return await getDocs(session.user.id, currentProfile?.uuid);
    }
  );

  const docs: Doc[] = docsResponse?.success ? docsResponse.docs || [] : [];

  const uploadDoc = useCallback(
    async (data: {
      file: File;
      name: string;
      description?: string;
      tags?: string[];
    }) => {
      if (!session?.user?.id) {
        throw new Error('Not authenticated');
      }

      const formData = new FormData();
      formData.append('file', data.file);
      formData.append('name', data.name);
      if (data.description) {
        formData.append('description', data.description);
      }
      if (data.tags && data.tags.length > 0) {
        formData.append('tags', data.tags.join(','));
      }

      const result = await createDoc(session.user.id, currentProfile?.uuid, formData);

      if (result.success) {
        // Optimistically update the cache
        await mutate();
        toast({
          title: 'Success',
          description: 'Document uploaded successfully',
        });
        
        // Show RAG processing status
        if (result.ragProcessed) {
          toast({
            title: 'RAG Processing',
            description: 'Document has been added to your knowledge base',
          });
        } else if (result.ragError) {
          toast({
            title: 'RAG Processing Failed',
            description: `Document uploaded but RAG processing failed: ${result.ragError}`,
            variant: 'destructive',
          });
        }
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to upload document',
          variant: 'destructive',
        });
        throw new Error(result.error || 'Failed to upload document');
      }
    },
    [session?.user?.id, currentProfile?.uuid, mutate, toast]
  );

  const removeDoc = useCallback(
    async (docUuid: string) => {
      if (!session?.user?.id) {
        throw new Error('Not authenticated');
      }

      const result = await deleteDoc(session.user.id, docUuid, currentProfile?.uuid);
      
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
    [session?.user?.id, currentProfile?.uuid, mutate, toast]
  );

  const downloadDoc = useCallback(
    (doc: Doc) => {
      if (!session?.user?.id) {
        throw new Error('Not authenticated');
      }

      // Create download URL with workspace verification
      const downloadUrl = `/api/docs/download/${doc.uuid}${currentProfile?.uuid ? `?profileUuid=${currentProfile.uuid}` : ''}`;
      
      // Create a temporary link and trigger download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = doc.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    [session?.user?.id, currentProfile?.uuid]
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