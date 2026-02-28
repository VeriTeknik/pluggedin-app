/**
 * Z-Report Service
 *
 * Generates AI-compressed end-of-session summaries (inspired by retail Z-reports).
 * When a session ends, all observations are collected and compressed into a
 * structured summary stored in memory_sessions.z_report.
 */

import { ChatOpenAI } from '@langchain/openai';

import { getSessionObservations } from './observation-service';
import { getSessionByUuid, storeZReport } from './session-service';
import { addObservation } from './observation-service';
import { Z_REPORT_MAX_TOKENS, Z_REPORT_MAX_OBSERVATIONS } from './constants';
import type { MemoryResult, ZReport } from './types';

// ============================================================================
// Z-Report Generation
// ============================================================================

const Z_REPORT_SYSTEM_PROMPT = `You are a Memory Summarizer. Generate a Z-Report (end-of-session summary) from the given observations.

The Z-Report must be concise and structured:
- summary: A 1-3 sentence overview of what happened in this session (max 200 tokens)
- key_observations: Top observations worth remembering (max ${Z_REPORT_MAX_OBSERVATIONS} items)
- decisions_made: Key decisions or choices made during the session
- tools_used: List of tools/MCP servers used
- success_rate: Estimated success rate 0.0-1.0 based on outcomes

Respond in JSON format:
{
  "summary": "...",
  "key_observations": ["...", "..."],
  "decisions_made": ["...", "..."],
  "tools_used": ["...", "..."],
  "success_rate": 0.85
}`;

function getZReportLLM(): ChatOpenAI {
  return new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: process.env.MEMORY_ZREPORT_MODEL || 'gpt-4o-mini',
    temperature: 0.2,
    maxTokens: Z_REPORT_MAX_TOKENS,
  });
}

/**
 * Generate a Z-report for a completed session
 */
export async function generateZReport(
  sessionUuid: string
): Promise<MemoryResult<ZReport>> {
  try {
    const session = await getSessionByUuid(sessionUuid);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    // Already has a Z-report
    if (session.z_report) {
      return { success: true, data: session.z_report as ZReport };
    }

    // Collect all observations for this session
    const observations = await getSessionObservations(sessionUuid, { limit: 200 });

    if (observations.length === 0) {
      // Empty session - create minimal Z-report
      const emptyReport: ZReport = {
        summary: 'Empty session with no observations.',
        token_count: 10,
        key_observations: [],
        decisions_made: [],
        tools_used: [],
        success_rate: 0,
        generated_at: new Date().toISOString(),
      };

      await storeZReport(sessionUuid, emptyReport);
      return { success: true, data: emptyReport };
    }

    // Format observations for LLM
    const observationText = observations
      .map((obs, i) => {
        const outcome = obs.outcome ? ` [${obs.outcome}]` : '';
        const toolInfo = obs.metadata && typeof obs.metadata === 'object' && 'tool_name' in obs.metadata
          ? ` (tool: ${(obs.metadata as { tool_name?: string }).tool_name})`
          : '';
        return `${i + 1}. [${obs.observation_type}]${outcome}${toolInfo}: ${obs.content.substring(0, 300)}`;
      })
      .join('\n');

    const llm = getZReportLLM();

    const response = await llm.invoke([
      { role: 'system', content: Z_REPORT_SYSTEM_PROMPT },
      { role: 'user', content: `Session observations (${observations.length} total):\n\n${observationText}` },
    ]);

    const text = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse Z-report response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const zReport: ZReport = {
      summary: parsed.summary,
      token_count: Math.ceil(text.length / 4),
      key_observations: parsed.key_observations?.slice(0, Z_REPORT_MAX_OBSERVATIONS) ?? [],
      decisions_made: parsed.decisions_made ?? [],
      tools_used: parsed.tools_used ?? [],
      success_rate: parsed.success_rate ?? 0,
      generated_at: new Date().toISOString(),
      generated_by_model: process.env.MEMORY_ZREPORT_MODEL || 'gpt-4o-mini',
    };

    // Store Z-report in session
    await storeZReport(sessionUuid, zReport);

    // Create an INSIGHT observation from the Z-report for potential promotion
    await addObservation({
      profileUuid: session.profile_uuid,
      sessionUuid: session.uuid,
      agentUuid: session.agent_uuid ?? undefined,
      type: 'insight',
      content: `Z-Report: ${zReport.summary}`,
      outcome: zReport.success_rate >= 0.7 ? 'success' : 'neutral',
      metadata: {
        tool_name: 'z-report-generator',
        context_hash: `zreport-${sessionUuid}`,
      },
    });

    return { success: true, data: zReport };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate Z-report',
    };
  }
}

/**
 * Get Z-reports for a profile
 */
export async function getZReports(
  profileUuid: string,
  options?: {
    agentUuid?: string;
    limit?: number;
  }
) {
  // This delegates to session-service's getSessionHistory
  // filtering for completed sessions with z_reports
  const { getSessionHistory } = await import('./session-service');

  const sessions = await getSessionHistory(profileUuid, {
    agentUuid: options?.agentUuid,
    limit: options?.limit ?? 20,
    status: 'completed',
  });

  return sessions
    .filter(s => s.z_report !== null)
    .map(s => ({
      sessionUuid: s.uuid,
      agentUuid: s.agent_uuid,
      startedAt: s.started_at?.toISOString(),
      endedAt: s.ended_at?.toISOString(),
      observationCount: s.observation_count,
      totalTokens: s.total_tokens,
      zReport: s.z_report as ZReport,
    }));
}
