'use client';

import { useSession } from 'next-auth/react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useProfiles } from '@/hooks/use-profiles';
import type { UploadProgressState } from '@/types/docs';

interface UploadProgressContextType {
  uploads: UploadProgressState[];
  addUpload: (upload: Omit<UploadProgressState, 'created_at'>) => void;
  removeUpload: (uploadId: string) => void;
  clearCompleted: () => void;
}

interface PollTracker {
  uploadId: string;
  ragIdentifier: string;
  pollCount: number;
  isActive: boolean;
  lastPollTime: number;
}

const UploadProgressContext = createContext<UploadProgressContextType | undefined>(undefined);

export function UploadProgressProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const { currentProfile } = useProfiles();
  const { t } = useTranslation('docs');
  const [uploads, setUploads] = useState<UploadProgressState[]>([]);
  const [pollTrackers, setPollTrackers] = useState<Map<string, PollTracker>>(new Map());
  const [pollTrigger, setPollTrigger] = useState(0);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setPollTrackers(new Map());
    };
  }, []);

  // Main polling effect
  useEffect(() => {
    const activePollTrackers = Array.from(pollTrackers.values()).filter(tracker => tracker.isActive);
    
    if (activePollTrackers.length === 0) return;

    const pollAll = async () => {
      for (const tracker of activePollTrackers) {
        // Check if enough time has passed since last poll (2.5 seconds)
        const timeSinceLastPoll = Date.now() - tracker.lastPollTime;
        if (timeSinceLastPoll < 2500) {
          continue;
        }
        
        try {
          tracker.pollCount++;
          
          // Update last poll time
          setPollTrackers(prev => {
            const newMap = new Map(prev);
            const updatedTracker = newMap.get(tracker.uploadId);
            if (updatedTracker) {
              updatedTracker.lastPollTime = Date.now();
              updatedTracker.pollCount = tracker.pollCount;
            }
            return newMap;
          });

          if (tracker.pollCount > 240) { // 10 minutes max
            setPollTrackers(prev => {
              const newMap = new Map(prev);
              newMap.delete(tracker.uploadId);
              return newMap;
            });
            
            setUploads(prev => prev.map(upload => {
              if (upload.upload_id === tracker.uploadId) {
                return {
                  ...upload,
                  status: 'failed' as const,
                  message: t('uploadProgress.timeoutMessage'),
                };
              }
              return upload;
            }));
            continue;
          }
          
          const result = await fetch(`/api/upload-status/${tracker.uploadId}?ragIdentifier=${tracker.ragIdentifier}`, {
            method: 'GET',
          });

          if (result.ok) {
            const data = await result.json();

            if (data.success && data.progress) {
              const progress = data.progress;

              setUploads(prev => prev.map(upload => {
                if (upload.upload_id === tracker.uploadId) {
                  return {
                    ...upload,
                    status: progress.status,
                    progress: progress.progress,
                    message: progress.message,
                    document_id: progress.document_id,
                  };
                }
                return upload;
              }));

              // Stop polling if completed or failed
              if (progress.status === 'completed' || progress.status === 'failed') {
                setPollTrackers(prev => {
                  const newMap = new Map(prev);
                  newMap.delete(tracker.uploadId);
                  return newMap;
                });
              }
            }
          } else if (result.status === 404 && tracker.pollCount > 4) {
            setPollTrackers(prev => {
              const newMap = new Map(prev);
              newMap.delete(tracker.uploadId);
              return newMap;
            });
            
            setUploads(prev => prev.map(upload => {
              if (upload.upload_id === tracker.uploadId) {
                return {
                  ...upload,
                  status: 'completed' as const,
                  message: t('uploadProgress.processingCompletedMessage'),
                  progress: {
                    ...upload.progress,
                    current: 5,
                    step: 'database_insertion' as const,
                    step_progress: { percentage: 100 }
                  }
                };
              }
              return upload;
            }));
          }
        } catch (error) {
          // Silent error handling - could add proper error reporting here
        }
      }

      // Schedule next polling cycle if there are still active trackers
      const stillActive = Array.from(pollTrackers.values()).some(t => t.isActive);
      if (stillActive) {
        setTimeout(() => {
          setPollTrigger(prev => prev + 1);
        }, 2500);
      }
    };

    pollAll();
  }, [pollTrigger, pollTrackers, t]);

  const addUpload = useCallback((upload: Omit<UploadProgressState, 'created_at'>) => {
    const newUpload: UploadProgressState = {
      ...upload,
      created_at: new Date(),
    };

    setUploads(prev => [...prev, newUpload]);

    // Start polling for this upload
    if (session?.user?.id && upload.status === 'processing') {
      const ragIdentifier = currentProfile?.uuid || session.user.id;
      
      setPollTrackers(prev => new Map(prev.set(upload.upload_id, {
        uploadId: upload.upload_id,
        ragIdentifier,
        pollCount: 0,
        isActive: true,
        lastPollTime: 0, // Will poll immediately
      })));

      // Trigger initial poll
      setPollTrigger(prev => prev + 1);
    }
  }, [session?.user?.id, currentProfile?.uuid]);

  const removeUpload = useCallback((uploadId: string) => {
    setUploads(prev => prev.filter(upload => upload.upload_id !== uploadId));
    setPollTrackers(prev => {
      const newMap = new Map(prev);
      newMap.delete(uploadId);
      return newMap;
    });
  }, []);

  const clearCompleted = useCallback(() => {
    setUploads(prev => {
      const processing = prev.filter(upload => upload.status === 'processing');
      const completed = prev.filter(upload => upload.status !== 'processing');
      
      // Stop polling for completed uploads
      completed.forEach(upload => {
        setPollTrackers(prevTrackers => {
          const newMap = new Map(prevTrackers);
          newMap.delete(upload.upload_id);
          return newMap;
        });
      });
      
      return processing;
    });
  }, []);

  return (
    <UploadProgressContext.Provider value={{
      uploads,
      addUpload,
      removeUpload,
      clearCompleted,
    }}>
      {children}
    </UploadProgressContext.Provider>
  );
}

export function useUploadProgress() {
  const context = useContext(UploadProgressContext);
  if (context === undefined) {
    throw new Error('useUploadProgress must be used within an UploadProgressProvider');
  }
  return context;
} 