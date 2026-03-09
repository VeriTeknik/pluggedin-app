import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { searchMemories } from '@/lib/memory/retrieval-service';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

import { authenticate } from '../../auth';

const querySchema = z.object({
  query: z.string().min(1).max(500).optional(),
  top_procedures: z.coerce.number().int().min(1).max(10).optional(),
  top_longterm: z.coerce.number().int().min(1).max(10).optional(),
});

/**
 * GET /api/memory/resume - Context brief for session-start injection
 *
 * Runs parallel searches across procedures, longterm, and shocks,
 * then returns a compact context brief ready to inject into the conversation.
 *
 * Response includes:
 * - brief: formatted <memory-context> block (ready to output directly)
 * - procedures: top N relevant procedures
 * - longterm: top N hard-won insights
 * - shocks: all shocks (always included regardless of query relevance)
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimitResult = await EnhancedRateLimiters.api(request);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests', retryAfter: rateLimitResult.retryAfter },
        { status: 429 }
      );
    }

    const auth = await authenticate(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      query: searchParams.get('query') ?? undefined,
      top_procedures: searchParams.get('top_procedures') ?? undefined,
      top_longterm: searchParams.get('top_longterm') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      query = 'plan step completed procedure workflow algorithm',
      top_procedures: topProcedures = 3,
      top_longterm: topLongterm = 5,
    } = parsed.data;

    const profileUuid = auth.activeProfile.uuid;

    // Run all searches in parallel for efficiency
    const [proceduresResult, longtermResult, shocksResult] = await Promise.all([
      searchMemories({
        profileUuid,
        query,
        ringTypes: ['procedures'],
        topK: topProcedures,
        threshold: 0.4,
      }),
      searchMemories({
        profileUuid,
        query,
        ringTypes: ['longterm'],
        topK: topLongterm,
        threshold: 0.4,
      }),
      // Shocks use lower threshold — always surface them
      searchMemories({
        profileUuid,
        query: 'critical failure incident shock data loss security breach',
        ringTypes: ['shocks'],
        topK: 5,
        threshold: 0.2,
      }),
    ]);

    if (!proceduresResult.success) console.error('[memory/resume] procedures search failed:', proceduresResult.error);
    if (!longtermResult.success) console.error('[memory/resume] longterm search failed:', longtermResult.error);
    if (!shocksResult.success) console.error('[memory/resume] shocks search failed:', shocksResult.error);

    const procedures = proceduresResult.success ? (proceduresResult.data ?? []) : [];
    const longterm = longtermResult.success ? (longtermResult.data ?? []) : [];
    const shocks = shocksResult.success ? (shocksResult.data ?? []) : [];

    // Strip </memory-context> to prevent prompt injection, then truncate and flatten.
    const formatSnippet = (content: string, maxLength: number) =>
      content.replace(/<\/memory-context>/gi, '[/memory-context]').trim().slice(0, maxLength).replace(/\n/g, ' ');

    // Build compact context brief (< 500 tokens target)
    const lines: string[] = ['<memory-context>', `## Memory Brief — ${new Date().toISOString().split('T')[0]}`, ''];

    if (procedures.length > 0) {
      lines.push('### Active Procedures');
      for (const p of procedures) {
        lines.push(`- **[procedure]** ${formatSnippet(p.content, 200)}`);
      }
      lines.push('');
    }

    if (longterm.length > 0) {
      lines.push('### Known Pitfalls & Insights');
      for (const m of longterm) {
        lines.push(`- ${formatSnippet(m.content, 150)}`);
      }
      lines.push('');
    }

    if (shocks.length > 0) {
      lines.push('### Critical Warnings');
      for (const s of shocks) {
        lines.push(`⚠️  ${formatSnippet(s.content, 200)}`);
      }
      lines.push('');
    }

    const hasAny = procedures.length > 0 || longterm.length > 0 || shocks.length > 0;
    if (!hasAny) {
      lines.push('No relevant memories found for this session.');
    }

    lines.push('</memory-context>');
    const brief = lines.join('\n');

    return NextResponse.json({
      success: true,
      data: {
        brief,
        procedures,
        longterm,
        shocks,
      },
    });
  } catch (error) {
    console.error('[memory/resume] Unhandled error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
