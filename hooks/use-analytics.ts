/**
 * Custom hooks for analytics data fetching
 * Centralizes SWR calls to reduce duplication
 */

import useSWR from 'swr';

import {
  getOverviewMetrics,
  getToolAnalytics,
  getRagAnalytics,
  getProductivityMetrics,
  getRecentDocuments,
  getRecentToolCalls,
  type TimePeriod,
} from '@/app/actions/analytics';

// SWR options for all analytics hooks
// Aligned with cache TTL (5 minutes) to reduce unnecessary API calls
const SWR_OPTIONS = {
  refreshInterval: 5 * 60 * 1000, // Refresh every 5 minutes (matches cache TTL)
  revalidateOnFocus: false,        // Reduce unnecessary requests on focus
};

/**
 * Hook for fetching overview metrics
 */
export function useOverviewMetrics(profileUuid: string | undefined, period: TimePeriod) {
  return useSWR(
    profileUuid ? ['overview', profileUuid, period] : null,
    () => getOverviewMetrics(profileUuid!, period),
    SWR_OPTIONS
  );
}

/**
 * Hook for fetching tool analytics
 */
export function useToolMetrics(profileUuid: string | undefined, period: TimePeriod) {
  return useSWR(
    profileUuid ? ['tools', profileUuid, period] : null,
    () => getToolAnalytics(profileUuid!, period),
    SWR_OPTIONS
  );
}

/**
 * Hook for fetching RAG analytics
 */
export function useRagMetrics(profileUuid: string | undefined, period: TimePeriod) {
  return useSWR(
    profileUuid ? ['rag', profileUuid, period] : null,
    () => getRagAnalytics(profileUuid!, period),
    SWR_OPTIONS
  );
}

/**
 * Hook for fetching productivity metrics
 */
export function useProductivityMetrics(profileUuid: string | undefined, period: TimePeriod) {
  return useSWR(
    profileUuid ? ['productivity', profileUuid, period] : null,
    () => getProductivityMetrics(profileUuid!, period),
    SWR_OPTIONS
  );
}

/**
 * Hook for fetching recent tool calls
 */
export function useToolCallLog(profileUuid: string | undefined, limit: number = 100) {
  return useSWR(
    profileUuid ? ['tool-call-log', profileUuid, limit] : null,
    () => getRecentToolCalls(profileUuid!, limit),
    SWR_OPTIONS
  );
}

/**
 * Hook for fetching recent documents
 */
export function useRecentDocuments(profileUuid: string | undefined, limit: number = 10) {
  return useSWR(
    profileUuid ? ['recent-documents', profileUuid, limit] : null,
    () => getRecentDocuments(profileUuid!, limit),
    SWR_OPTIONS
  );
}

/**
 * Hook for fetching recent tool calls (dashboard version)
 */
export function useRecentToolCalls(profileUuid: string | undefined, limit: number = 10) {
  return useSWR(
    profileUuid ? ['recent-tool-calls', profileUuid, limit] : null,
    () => getRecentToolCalls(profileUuid!, limit),
    SWR_OPTIONS
  );
}