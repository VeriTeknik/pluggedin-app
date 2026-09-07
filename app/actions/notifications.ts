'use server';

import { withProfileAuth } from '@/lib/auth-helpers';
import * as notifications from '@/lib/notifications-internal';

export type { NotificationType, NotificationSeverity } from '@/lib/notifications-internal';

export async function createNotification(...args: Parameters<typeof notifications.createNotification>) {
  try {
    return await withProfileAuth(args[0].profileUuid, () => notifications.createNotification(...args));
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unauthorized' };
  }
}

export async function getNotifications(...args: Parameters<typeof notifications.getNotifications>) {
  try {
    return await withProfileAuth(args[0], () => notifications.getNotifications(...args));
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unauthorized' };
  }
}

export async function markNotificationAsRead(...args: Parameters<typeof notifications.markNotificationAsRead>) {
  try {
    return await withProfileAuth(args[1], () => notifications.markNotificationAsRead(...args));
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unauthorized' };
  }
}

export async function markAllNotificationsAsRead(...args: Parameters<typeof notifications.markAllNotificationsAsRead>) {
  try {
    return await withProfileAuth(args[0], () => notifications.markAllNotificationsAsRead(...args));
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unauthorized' };
  }
}

export async function deleteNotification(...args: Parameters<typeof notifications.deleteNotification>) {
  try {
    return await withProfileAuth(args[1], () => notifications.deleteNotification(...args));
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unauthorized' };
  }
}

export async function deleteAllNotifications(...args: Parameters<typeof notifications.deleteAllNotifications>) {
  try {
    return await withProfileAuth(args[0], () => notifications.deleteAllNotifications(...args));
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unauthorized' };
  }
}

export async function toggleNotificationCompleted(...args: Parameters<typeof notifications.toggleNotificationCompleted>) {
  try {
    return await withProfileAuth(args[1], () => notifications.toggleNotificationCompleted(...args));
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unauthorized' };
  }
}
