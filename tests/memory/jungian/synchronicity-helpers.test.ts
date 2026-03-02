import { describe, expect, it } from 'vitest';

import { formatPatternDescription } from '@/lib/memory/jungian/synchronicity-detector';
import type { SynchronicityPattern } from '@/lib/memory/jungian/types';

type PatternWithAnalysis = SynchronicityPattern & { analysisType: string };

describe('formatPatternDescription', () => {
  it('formats co_occurrence pattern', () => {
    const pattern: PatternWithAnalysis = {
      analysisType: 'co_occurrence',
      toolName: 'file_read',
      relatedTool: 'file_write',
      uniqueProfiles: 12,
    };
    const desc = formatPatternDescription(pattern);
    expect(desc).toBe(
      'After using file_read, users frequently use file_write (12 profiles)'
    );
  });

  it('formats failure_correlation pattern', () => {
    const pattern: PatternWithAnalysis = {
      analysisType: 'failure_correlation',
      toolName: 'api_call',
      failureRate: 0.75,
      dayOfWeek: 1,
      hourOfDay: 14,
      uniqueProfiles: 8,
      total: 200,
    };
    const desc = formatPatternDescription(pattern);
    expect(desc).toBe(
      'api_call has 75% failure rate on day 1 hour 14 (8 profiles, 200 events)'
    );
  });

  it('handles undefined failureRate in failure_correlation', () => {
    const pattern: PatternWithAnalysis = {
      analysisType: 'failure_correlation',
      toolName: 'db_query',
      uniqueProfiles: 5,
    };
    const desc = formatPatternDescription(pattern);
    expect(desc).toContain('0% failure rate');
    expect(desc).toContain('day 0 hour 0');
    expect(desc).toContain('0 events');
  });

  it('formats emergent_workflow pattern', () => {
    const pattern: PatternWithAnalysis = {
      analysisType: 'emergent_workflow',
      toolName: 'search',
      relatedTool: 'read',
      thirdTool: 'write',
      uniqueProfiles: 20,
    };
    const desc = formatPatternDescription(pattern);
    expect(desc).toBe(
      'Common workflow: search → read → write (20 profiles)'
    );
  });

  it('returns fallback for unknown analysis type', () => {
    // Cast to bypass type narrowing — tests the default switch branch
    const pattern = {
      analysisType: 'unknown_type',
      toolName: 'some_tool',
      uniqueProfiles: 3,
    } as unknown as PatternWithAnalysis;
    const desc = formatPatternDescription(pattern);
    expect(desc).toBe('Synchronicity pattern: some_tool (3 profiles)');
  });

  it('rounds failure rate correctly', () => {
    const pattern: PatternWithAnalysis = {
      analysisType: 'failure_correlation',
      toolName: 'test_tool',
      failureRate: 0.333,
      dayOfWeek: 0,
      hourOfDay: 0,
      uniqueProfiles: 5,
      total: 100,
    };
    const desc = formatPatternDescription(pattern);
    expect(desc).toContain('33% failure rate');
  });
});
