/**
 * Task tools, over what the app stores as notifications.
 *
 * The user's word for these is "tasks", and the scope is `tasks:*`, but the
 * table and the actions underneath are called notifications. Kept the internal
 * names as they are rather than renaming a live table for vocabulary — the
 * mapping is stated here once so the next reader is not left wondering whether
 * two systems exist.
 *
 * These hang off a *profile*, not a project, so they go through
 * requireHubProfile: a Hub proven granted, then that Hub's profile. A profile
 * uuid obtained any other way has not been through the Hub check, and the
 * branded types keep the two from being swapped.
 */

import {
  deleteNotification,
  getNotifications,
  markNotificationAsRead,
  toggleNotificationCompleted,
} from '@/app/actions/notifications';
import type { ConnectorIdentity } from '@/lib/oauth/provider/authenticate';

import { requireHubProfile } from '../hub-scope';
import { toolFailure as failure, toolText as text, type ToolResult } from '../tool-result';

/** What a model is told about a task. Narrower than the row. */
function summarise(row: {
  id: string;
  title: string;
  message?: string | null;
  severity?: string | null;
  completed?: boolean | null;
  read?: boolean | null;
  created_at?: Date | string;
}) {
  return {
    id: row.id,
    title: row.title,
    detail: row.message ?? undefined,
    severity: row.severity ?? undefined,
    done: row.completed ?? false,
    read: row.read ?? false,
    createdAt: row.created_at,
  };
}

export async function listTasks(
  identity: ConnectorIdentity,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const resolved = await requireHubProfile(identity, params.hub);
  if (!resolved.ok) return failure(resolved.message);

  const onlyOpen = params.onlyOpen === true;
  const result = await getNotifications(resolved.profile, onlyOpen);
  if (!result.success) return failure(result.error ?? 'Could not list tasks.');

  const tasks = (result.notifications ?? []).map(summarise);
  return text({ hub: resolved.name, count: tasks.length, tasks });
}

export async function completeTask(
  identity: ConnectorIdentity,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const id = typeof params.id === 'string' ? params.id.trim() : '';
  if (!id) return failure('id is required: pass a task id from pluggedin_list_notifications');

  const resolved = await requireHubProfile(identity, params.hub);
  if (!resolved.ok) return failure(resolved.message);

  // Both calls carry the profile, so a task belonging to another Hub cannot be
  // reached by id alone — the action filters on it rather than trusting the id.
  const result = await toggleNotificationCompleted(id, resolved.profile);
  if (!result.success) return failure(result.error ?? 'Could not complete the task.');

  await markNotificationAsRead(id, resolved.profile);
  return text({ hub: resolved.name, id, done: true });
}

export async function removeTask(
  identity: ConnectorIdentity,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const id = typeof params.id === 'string' ? params.id.trim() : '';
  if (!id) return failure('id is required: pass a task id from pluggedin_list_notifications');

  const resolved = await requireHubProfile(identity, params.hub);
  if (!resolved.ok) return failure(resolved.message);

  const result = await deleteNotification(id, resolved.profile);
  if (!result.success) return failure(result.error ?? 'Could not delete the task.');

  return text({ hub: resolved.name, id, deleted: true });
}
