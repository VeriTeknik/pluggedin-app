'use client';

import { createNotification, NotificationType } from '@/app/actions/notifications';
import { toast } from '@/hooks/use-toast';

interface NotificationOptions {
  title: string;
  description?: string;
  type?: NotificationType;
  link?: string;
  profileUuid?: string;
  duration?: number;
  saveToDatabase?: boolean;
}

/**
 * Helper function to show a toast and optionally save it to the database
 */
export async function showNotification({
  title,
  description = '',
  type = 'INFO',
  link,
  profileUuid,
  duration,
  saveToDatabase = true,
}: NotificationOptions) {
  // Show toast immediately
  const variant = type === 'ALERT' || type === 'WARNING' ? 'destructive' : 'default';
  
  toast({
    title,
    description,
    variant,
    duration,
  });

  // Save to database if requested and profileUuid is provided
  if (saveToDatabase && profileUuid) {
    try {
      await createNotification({
        profileUuid,
        type,
        title,
        message: description,
        link,
        expiresInDays: 30, // Default 30 days expiry
      });
    } catch (error) {
      console.error('Failed to save notification to database:', error);
    }
  }
}

/**
 * Preset notification types for common scenarios
 */
export const notifications = {
  success: (title: string, description?: string, options?: Partial<NotificationOptions>) =>
    showNotification({
      title,
      description,
      type: 'SUCCESS',
      ...options,
    }),

  error: (title: string, description?: string, options?: Partial<NotificationOptions>) =>
    showNotification({
      title,
      description,
      type: 'ALERT',
      ...options,
    }),

  warning: (title: string, description?: string, options?: Partial<NotificationOptions>) =>
    showNotification({
      title,
      description,
      type: 'WARNING',
      ...options,
    }),

  info: (title: string, description?: string, options?: Partial<NotificationOptions>) =>
    showNotification({
      title,
      description,
      type: 'INFO',
      ...options,
    }),
};