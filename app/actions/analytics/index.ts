/**
 * Analytics Actions Index
 *
 * This file re-exports all analytics functions from their domain modules
 * to maintain backward compatibility with existing imports
 */

export { getOverviewMetrics, type OverviewMetrics } from './overview';
export { getToolAnalytics, type ToolAnalytics } from './tools';
export { getRagAnalytics, type RagAnalytics } from './rag';
export { getProductivityMetrics, type ProductivityMetrics } from './productivity';
export { getRecentDocuments, type RecentDocument } from './recent-documents';
export { getRecentToolCalls, type ToolCallLogEntry } from './recent-tools';

// Re-export common types
export type { TimePeriod } from '../analytics-hof';