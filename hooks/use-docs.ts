import { useSession } from 'next-auth/react';
import { useCallback } from 'react';
import useSWR from 'swr';

import { createDoc, deleteDoc, getDocs, getProjectStorageUsage } from '@/app/actions/docs';
import { useUploadProgress } from '@/contexts/UploadProgressContext';
import { useProjects } from '@/hooks/use-projects';
import type { Doc } from '@/types/docs';

import { useToast } from './use-toast';

export function useDocs() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const { currentProject } = useProjects();
  const { addUpload } = useUploadProgress();

  const {
    data: docsResponse,
    error,
    mutate,
    isLoading,
  } = useSWR(
    session?.user?.id ? ['docs', session.user.id, currentProject?.uuid] : null,
    async () => {
      if (!session?.user?.id) {
        throw new Error('Not authenticated');
      }
      return await getDocs(session.user.id, currentProject?.uuid);
    }
  );

  // Fetch storage usage data separately
  const {
    data: storageResponse,
    mutate: mutateStorage,
  } = useSWR(
    session?.user?.id ? ['storage', session.user.id, currentProject?.uuid] : null,
    async () => {
      if (!session?.user?.id) {
        throw new Error('Not authenticated');
      }
      return await getProjectStorageUsage(session.user.id, currentProject?.uuid);
    }
  );

  const docs: Doc[] = docsResponse?.success ? docsResponse.docs || [] : [];
  const storageUsage = storageResponse?.success ? storageResponse.usage : 0;
  const storageLimit = storageResponse?.success ? storageResponse.limit : 100 * 1024 * 1024;

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

      const result = await createDoc(session.user.id, currentProject?.uuid, formData);

      if (result.success) {
        // Optimistically update both caches
        await Promise.all([mutate(), mutateStorage()]);
        
        // Add to progress tracking if we have an upload_id
        if (result.upload_id && result.doc) {
          addUpload({
            upload_id: result.upload_id,
            doc_uuid: result.doc.uuid,
            file_name: data.file.name,
            file_size: data.file.size,
            status: 'processing',
            progress: {
              step: 'text_extraction',
              current: 1,
              total: 5,
              step_progress: {
                percentage: 0,
              },
            },
            message: 'Starting document processing...',
            document_id: null,
          });
        }
        
        toast({
          title: 'Upload Started',
          description: 'Document uploaded successfully, processing in background',
        });
        
        // Handle legacy RAG processing status (for backward compatibility)
        if (result.ragProcessed && !result.upload_id) {
          toast({
            title: 'RAG Processing Complete',
            description: 'Document has been added to your knowledge base',
          });
        } else if (result.ragError && !result.upload_id) {
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
    [session?.user?.id, currentProject?.uuid, mutate, mutateStorage, toast, addUpload]
  );

  const removeDoc = useCallback(
    async (docUuid: string) => {
      if (!session?.user?.id) {
        throw new Error('Not authenticated');
      }

      const result = await deleteDoc(session.user.id, docUuid, currentProject?.uuid);
      
      if (result.success) {
        // Optimistically update both caches
        await Promise.all([mutate(), mutateStorage()]);
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
    [session?.user?.id, currentProject?.uuid, mutate, mutateStorage, toast]
  );

  const downloadDoc = useCallback(
    (doc: Doc) => {
      if (!session?.user?.id) {
        throw new Error('Not authenticated');
      }

      // Create download URL with project verification
      const downloadUrl = `/api/docs/download/${doc.uuid}${currentProject?.uuid ? `?projectUuid=${currentProject.uuid}` : ''}`;
      
      // Create a temporary link and trigger download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = doc.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    [session?.user?.id, currentProject?.uuid]
  );

  return {
    docs,
    isLoading,
    error: error || (docsResponse && !docsResponse.success ? docsResponse.error : null),
    storageUsage,
    storageLimit,
    uploadDoc,
    removeDoc,
    downloadDoc,
    mutate,
  };
} 