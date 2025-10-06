'use server';

/**
 * Analytics Actions
 *
 * This file maintains backward compatibility by re-exporting from the new modular structure.
 * The analytics logic has been refactored into separate domain modules for better maintainability.
 *
 * @see ./analytics/overview.ts - Overview metrics and trends
 * @see ./analytics/tools.ts - Tool usage analytics
 * @see ./analytics/rag.ts - RAG and document analytics
 * @see ./analytics/productivity.ts - Productivity metrics and achievements
 * @see ./analytics/recent-tools.ts - Recent tool call logs
 * @see ./analytics-hof.ts - Higher-order function for reducing boilerplate
 */

import {
  getOverviewMetrics as _getOverviewMetrics,
  getProductivityMetrics as _getProductivityMetrics,
  getRagAnalytics as _getRagAnalytics,
  getRecentDocuments as _getRecentDocuments,
  getRecentToolCalls as _getRecentToolCalls,
  getToolAnalytics as _getToolAnalytics,
  type OverviewMetrics,
  type ProductivityMetrics,
  type RagAnalytics,
  type RecentDocument,
  type TimePeriod,
  type ToolAnalytics,
  type ToolCallLogEntry,
} from './analytics/index';

// Re-export types (not affected by 'use server')
export type {
  OverviewMetrics,
  ToolAnalytics,
  RagAnalytics,
  ProductivityMetrics,
  RecentDocument,
  ToolCallLogEntry,
  TimePeriod,
};

// Re-export functions as server actions
export async function getOverviewMetrics(profileUuid: string, period: TimePeriod = '7d') {
  return _getOverviewMetrics(profileUuid, period);
}

export async function getToolAnalytics(profileUuid: string, period: TimePeriod = '7d', serverUuid?: string) {
  return _getToolAnalytics(profileUuid, period, serverUuid);
}

export async function getRagAnalytics(profileUuid: string, period: TimePeriod = '7d') {
  return _getRagAnalytics(profileUuid, period);
}

export async function getProductivityMetrics(profileUuid: string, period: TimePeriod = '30d') {
  return _getProductivityMetrics(profileUuid, period);
}

export async function getRecentToolCalls(profileUuid: string, limit: number = 50) {
  return _getRecentToolCalls(profileUuid, limit);
}

export async function getRecentDocuments(profileUuid: string, limit: number = 10) {
  return _getRecentDocuments(profileUuid, limit);
}