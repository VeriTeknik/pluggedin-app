import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR, { useSWRConfig } from 'swr';

import { createDoc, deleteDoc, getDocs, getProjectStorageUsage, reindexDocument } from '@/app/actions/library';
import { useProjects } from '@/hooks/use-projects';
import { notifications } from '@/lib/notification-helper';
import type { Doc } from '@/types/library';

import { useProfiles } from './use-profiles';
import { useSafeSession } from './use-safe-session';
import { useToast } from './use-toast';

export function useLibrary() {
  const { data: session } = useSafeSession();
  const { toast } = useToast();
  const { t } = useTranslation('library');
  const { currentProject } = useProjects();
  const { currentProfile } = useProfiles();
  const { mutate: globalMutate } = useSWRConfig();

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
    error: storageError,
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
  const fileStorage = storageResponse?.success ? storageResponse.fileStorage : 0;
  const ragStorage = storageResponse?.success ? storageResponse.ragStorage : 0;
  const totalStorage = storageResponse?.success ? storageResponse.totalUsage : 0;
  const storageLimit = storageResponse?.success ? storageResponse.limit : 100 * 1024 * 1024;

  // Extract storage warnings and errors
  const storageWarnings = storageResponse?.warnings || [];
  const ragStorageAvailable = storageResponse?.ragStorageAvailable ?? false;
  const effectiveStorageError = storageError || (storageResponse && !storageResponse.success ? storageResponse.error : null);

  const uploadDoc = useCallback(
    async (data: {
      file: File;
      name: string;
      description?: string;
      tags?: string[];
      purpose?: string;
      relatedTo?: string;
      notes?: string;
      uploadMethod?: 'drag-drop' | 'file-picker';
    }) => {
      if (!session?.user?.id) {
        throw new Error('Not authenticated');
      }

      if (!currentProject) {
        throw new Error('No active project selected. Please select or create a project first.');
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
      if (data.purpose) {
        formData.append('purpose', data.purpose);
      }
      if (data.relatedTo) {
        formData.append('relatedTo', data.relatedTo);
      }
      if (data.notes) {
        formData.append('notes', data.notes);
      }
      if (data.uploadMethod) {
        formData.append('uploadMethod', data.uploadMethod);
      }

      const result = await createDoc(session.user.id, currentProject.uuid, formData);

      if (result.success) {
        // Optimistically update both caches
        await Promise.all([mutate(), mutateStorage()]);

        // Invalidate analytics cache to update dashboard immediately
        if (currentProfile?.uuid) {
          // Invalidate all analytics-related SWR keys for this profile
          globalMutate(
            (key: unknown) => {
              if (Array.isArray(key)) {
                // Check if this is an analytics key for the current profile
                return (key[0] === 'overview' || key[0] === 'recent-documents' || key[0] === 'rag') &&
                       key[1] === currentProfile.uuid;
              }
              return false;
            },
            undefined,
            { revalidate: true }
          );
        }

        if (result.ragError) {
          toast({
            title: t('upload.ragFailed', 'Upload Successful'),
            description: t('upload.ragFailedDesc', 'Document uploaded but indexing failed: {{error}}', { error: result.ragError }),
            variant: 'destructive',
          });
        } else {
          toast({
            title: t('upload.success', 'Document Uploaded'),
            description: result.ragProcessed
              ? t('upload.indexed', 'Document uploaded and indexed for search')
              : t('upload.savedOnly', 'Document uploaded successfully'),
          });
        }

        // Send notification for successful upload
        if (currentProfile?.uuid) {
          await notifications.success(
            'Document Uploaded',
            `Document "${data.name}" has been uploaded successfully`,
            { profileUuid: currentProfile.uuid }
          );
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
    [session?.user?.id, currentProject?.uuid, currentProfile?.uuid, mutate, mutateStorage, toast, t, globalMutate]
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

        // Invalidate analytics cache to update dashboard immediately
        if (currentProfile?.uuid) {
          // Invalidate all analytics-related SWR keys for this profile
          globalMutate(
            (key: unknown) => {
              if (Array.isArray(key)) {
                // Check if this is an analytics key for the current profile
                return (key[0] === 'overview' || key[0] === 'recent-documents' || key[0] === 'rag') &&
                       key[1] === currentProfile.uuid;
              }
              return false;
            },
            undefined,
            { revalidate: true }
          );
        }

        toast({
          title: 'Success',
          description: 'Document deleted successfully',
        });
        
        // Send notification for successful deletion
        if (currentProfile?.uuid) {
          await notifications.info(
            'Document Deleted',
            'Document has been removed from your library',
            { profileUuid: currentProfile.uuid }
          );
        }
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to delete document',
          variant: 'destructive',
        });
        throw new Error(result.error || 'Failed to delete document');
      }
    },
    [session?.user?.id, currentProject?.uuid, currentProfile?.uuid, mutate, mutateStorage, toast, globalMutate]
  );

  const reindexDoc = useCallback(
    async (docUuid: string) => {
      if (!session?.user?.id) {
        throw new Error('Not authenticated');
      }

      const result = await reindexDocument(session.user.id, docUuid, currentProject?.uuid);

      if (result.success) {
        // Refresh storage stats since chunk counts may have changed
        await mutateStorage();
        toast({
          title: t('grid.reindexSuccess'),
        });
      } else {
        toast({
          title: t('grid.reindexError'),
          description: result.error,
          variant: 'destructive',
        });
        throw new Error(result.error || t('grid.reindexError'));
      }
    },
    [session?.user?.id, currentProject?.uuid, mutateStorage, toast, t]
  );

  const downloadDoc = useCallback(
    (doc: Doc) => {
      if (!session?.user?.id) {
        throw new Error('Not authenticated');
      }

      // Create download URL with project verification
      const downloadUrl = `/api/library/download/${doc.uuid}${currentProject?.uuid ? `?projectUuid=${currentProject.uuid}` : ''}`;
      
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
    storageUsage: totalStorage, // Keep for backward compatibility
    fileStorage,
    ragStorage,
    totalStorage,
    storageLimit,
    storageError: effectiveStorageError,
    storageWarnings,
    ragStorageAvailable,
    uploadDoc,
    removeDoc,
    reindexDoc,
    downloadDoc,
    mutate,
  };
} 