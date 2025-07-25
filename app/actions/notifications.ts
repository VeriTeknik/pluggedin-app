'use server';

import { and, desc, eq, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/db';
import { notificationsTable } from '@/db/schema';
import type { NotificationMetadata } from '@/lib/types/notifications';
import { sanitizeMetadata } from '@/lib/types/notifications';

export type NotificationType = 'SYSTEM' | 'ALERT' | 'INFO' | 'SUCCESS' | 'WARNING' | 'CUSTOM';
export type NotificationSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'ALERT';

interface CreateNotificationOptions {
  profileUuid: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  expiresInDays?: number;
  severity?: NotificationSeverity;
  metadata?: NotificationMetadata;
}

export async function createNotification(options: CreateNotificationOptions) {
  try {
    const expiresAt = options.expiresInDays 
      ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000) 
      : null;
    
    await db.insert(notificationsTable).values({
      profile_uuid: options.profileUuid,
      type: options.type,
      title: options.title,
      message: options.message,
      link: options.link,
      severity: options.severity,
      metadata: options.metadata || {},
      created_at: new Date(),
      expires_at: expiresAt,
    });

    revalidatePath('/notifications');
    return { success: true };
  } catch (error) {
    console.error('Notification creation error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Shared helper to fetch a notification and sanitize its metadata.
 * Reduces duplication across mark/read and toggle functions.
 */
async function getNotificationWithMetadata(
  id: string,
  profileUuid: string
): Promise<{
  notification: typeof notificationsTable.$inferSelect | null;
  metadata: NotificationMetadata;
}> {
  const results = await db.select()
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.id, id),
        eq(notificationsTable.profile_uuid, profileUuid)
      )
    )
    .limit(1);

  if (results.length === 0) {
    return { notification: null, metadata: {} };
  }

  const notification = results[0];
  const metadata = sanitizeMetadata(notification.metadata);

  return { notification, metadata };
}

export async function getNotifications(profileUuid: string, onlyUnread = false) {
  try {
    let query = db.select()
      .from(notificationsTable)
      .where(eq(notificationsTable.profile_uuid, profileUuid))
      .orderBy(desc(notificationsTable.created_at));
    
    if (onlyUnread) {
      query = db.select()
        .from(notificationsTable)
        .where(
          and(
            eq(notificationsTable.profile_uuid, profileUuid),
            eq(notificationsTable.read, false)
          )
        )
        .orderBy(desc(notificationsTable.created_at));
    }
    
    const notifications = await query;
    
    return { success: true, notifications };
  } catch (error) {
    console.error('Get notifications error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function markNotificationAsRead(id: string, profileUuid: string) {
  try {
    const { notification, metadata } = await getNotificationWithMetadata(id, profileUuid);
    
    if (!notification) {
      return { 
        success: false, 
        error: 'Notification not found' 
      };
    }
    
    const updatedMetadata: NotificationMetadata = {
      ...metadata,
      actions: {
        ...metadata.actions,
        markedReadAt: new Date().toISOString(),
        markedReadProfileUuid: profileUuid
      }
    };
    
    await db.update(notificationsTable)
      .set({ 
        read: true,
        metadata: updatedMetadata
      })
      .where(
        and(
          eq(notificationsTable.id, id),
          eq(notificationsTable.profile_uuid, profileUuid)
        )
      );
    
    revalidatePath('/notifications');
    return { success: true };
  } catch (error) {
    console.error('Mark notification as read error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function markAllNotificationsAsRead(profileUuid: string) {
  try {
    await db.update(notificationsTable)
      .set({ read: true })
      .where(
        and(
          eq(notificationsTable.profile_uuid, profileUuid),
          eq(notificationsTable.read, false)
        )
      );
    
    revalidatePath('/notifications');
    return { success: true };
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function deleteNotification(id: string, profileUuid: string) {
  try {
    await db.delete(notificationsTable)
      .where(
        and(
          eq(notificationsTable.id, id),
          eq(notificationsTable.profile_uuid, profileUuid)
        )
      );
    
    revalidatePath('/notifications');
    return { success: true };
  } catch (error) {
    console.error('Delete notification error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function deleteAllNotifications(profileUuid: string) {
  try {
    // Delete all notifications except CUSTOM type
    await db.delete(notificationsTable)
      .where(
        and(
          eq(notificationsTable.profile_uuid, profileUuid),
          ne(notificationsTable.type, 'CUSTOM')
        )
      );
    
    revalidatePath('/notifications');
    return { success: true };
  } catch (error) {
    console.error('Delete all notifications error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function toggleNotificationCompleted(id: string, profileUuid: string) {
  try {
    const { notification, metadata } = await getNotificationWithMetadata(id, profileUuid);
    
    if (!notification) {
      return { 
        success: false, 
        error: 'Notification not found' 
      };
    }
    
    const isCompleting = !notification.completed;
    
    const updatedMetadata: NotificationMetadata = {
      ...metadata,
      actions: {
        ...metadata.actions,
        ...(isCompleting ? {
          completedAt: new Date().toISOString(),
          completedProfileUuid: profileUuid,
          completedVia: 'web'
        } : {
          completedAt: undefined,
          completedProfileUuid: undefined,
          completedVia: undefined
        })
      }
    };
    
    // Toggle the completed status
    await db.update(notificationsTable)
      .set({ 
        completed: isCompleting,
        metadata: updatedMetadata
      })
      .where(
        and(
          eq(notificationsTable.id, id),
          eq(notificationsTable.profile_uuid, profileUuid)
        )
      );
    
    revalidatePath('/notifications');
    return { success: true };
  } catch (error) {
    console.error('Toggle notification completed error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function toggleNotificationCompletedViaAPI(
  id: string, 
  profileUuid: string,
  apiKeyId?: string,
  apiKeyName?: string
) {
  try {
    const { notification, metadata } = await getNotificationWithMetadata(id, profileUuid);
    
    if (!notification) {
      return { 
        success: false, 
        error: 'Notification not found' 
      };
    }
    
    const isCompleting = !notification.completed;
    
    const updatedMetadata: NotificationMetadata = {
      ...metadata,
      actions: {
        ...metadata.actions,
        ...(isCompleting ? {
          completedAt: new Date().toISOString(),
          completedProfileUuid: profileUuid,
          completedVia: 'mcp'
        } : {
          completedAt: undefined,
          completedProfileUuid: undefined,
          completedVia: undefined
        })
      },
      // Add API source info if completing
      ...(isCompleting && apiKeyId ? {
        source: {
          ...(metadata.source || {}),
          type: metadata.source?.type || 'api',
          apiKeyId,
          apiKeyName
        }
      } : {})
    };
    
    // Toggle the completed status
    await db.update(notificationsTable)
      .set({ 
        completed: isCompleting,
        metadata: updatedMetadata
      })
      .where(
        and(
          eq(notificationsTable.id, id),
          eq(notificationsTable.profile_uuid, profileUuid)
        )
      );
    
    revalidatePath('/notifications');
    return { success: true, completed: isCompleting };
  } catch (error) {
    console.error('Toggle notification completed error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
} 