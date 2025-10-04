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
  getToolAnalytics as _getToolAnalytics,
  getRagAnalytics as _getRagAnalytics,
  getProductivityMetrics as _getProductivityMetrics,
  getRecentToolCalls as _getRecentToolCalls,
  type OverviewMetrics,
  type ToolAnalytics,
  type RagAnalytics,
  type ProductivityMetrics,
  type ToolCallLogEntry,
  type TimePeriod,
} from './analytics/index';

// Re-export types (not affected by 'use server')
export type {
  OverviewMetrics,
  ToolAnalytics,
  RagAnalytics,
  ProductivityMetrics,
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