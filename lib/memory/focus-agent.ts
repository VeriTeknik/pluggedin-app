/**
 * Focus Agent
 *
 * Manages the working set (7±2 items) during a session.
 * Like human attention, it can only hold a few things at once.
 * Focus creates relevance - this isn't a limitation, it's a feature.
 */

import { MAX_FOCUS_ITEMS, MIN_FOCUS_ITEMS } from './constants';
import { updateFocusItems, getSessionByUuid } from './session-service';
import type { FocusItem, MemoryResult } from './types';

/**
 * Add an item to the focus working set
 * If the set exceeds MAX_FOCUS_ITEMS, the least relevant item is dropped
 */
export async function addToFocus(
  sessionUuid: string,
  item: Omit<FocusItem, 'added_at'>
): Promise<MemoryResult> {
  try {
    const session = await getSessionByUuid(sessionUuid);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const currentItems = (session.focus_items ?? []) as FocusItem[];

    // Check if item already exists (update relevance if so)
    const existingIdx = currentItems.findIndex(i => i.id === item.id);
    if (existingIdx >= 0) {
      currentItems[existingIdx].relevance_score = item.relevance_score;
      return updateFocusItems(sessionUuid, currentItems);
    }

    // Add new item
    const newItem: FocusItem = {
      ...item,
      added_at: new Date().toISOString(),
    };

    const updatedItems = [...currentItems, newItem];

    // If over limit, drop least relevant
    if (updatedItems.length > MAX_FOCUS_ITEMS) {
      updatedItems.sort((a, b) => b.relevance_score - a.relevance_score);
      updatedItems.length = MAX_FOCUS_ITEMS;
    }

    return updateFocusItems(sessionUuid, updatedItems);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add to focus',
    };
  }
}

/**
 * Remove an item from focus
 */
export async function removeFromFocus(
  sessionUuid: string,
  itemId: string
): Promise<MemoryResult> {
  try {
    const session = await getSessionByUuid(sessionUuid);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const currentItems = (session.focus_items ?? []) as FocusItem[];
    const filtered = currentItems.filter(i => i.id !== itemId);

    return updateFocusItems(sessionUuid, filtered);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove from focus',
    };
  }
}

/**
 * Get current focus items for a session
 */
export async function getFocusItems(
  sessionUuid: string
): Promise<MemoryResult<FocusItem[]>> {
  try {
    const session = await getSessionByUuid(sessionUuid);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    return {
      success: true,
      data: (session.focus_items ?? []) as FocusItem[],
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get focus items',
    };
  }
}

/**
 * Replace the entire focus set (e.g., on context switch)
 */
export async function replaceFocus(
  sessionUuid: string,
  items: Omit<FocusItem, 'added_at'>[]
): Promise<MemoryResult> {
  const timestamped = items.map(item => ({
    ...item,
    added_at: new Date().toISOString(),
  }));

  // Enforce limit
  const sorted = timestamped
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, MAX_FOCUS_ITEMS);

  return updateFocusItems(sessionUuid, sorted);
}
