'use server';

import { and, desc,eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/db';
import { notificationsTable } from '@/db/schema';

export type NotificationType = 'SYSTEM' | 'ALERT' | 'INFO' | 'SUCCESS' | 'WARNING';

interface CreateNotificationOptions {
  profileUuid: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  expiresInDays?: number;
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
    await db.update(notificationsTable)
      .set({ read: true })
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
    await db.delete(notificationsTable)
      .where(eq(notificationsTable.profile_uuid, profileUuid));
    
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