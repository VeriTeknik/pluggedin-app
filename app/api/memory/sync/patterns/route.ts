import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { gutPatternsTable } from '@/db/schema';
import { queryIntuition } from '@/lib/memory/gut-agent';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

import { authenticate } from '../../../auth';

const querySchema = z.object({
  query: z.string().min(1).max(1000).optional(),
  topK: z.number().int().min(1).max(50).optional(),
});

/**
 * GET /api/memory/sync/patterns - List or search synchronicity patterns
 *
 * Without ?query: returns all synchronicity patterns (most recent first).
 * With ?query=...: performs a semantic vector search filtered to synchronicity patterns.
 *
 * NOTE: Synchronicity patterns are intentionally NOT scoped to a single profile.
 * They represent cross-profile collective intelligence — emergent patterns that only
 * become visible when multiple users independently exhibit similar behaviors.
 * K-anonymity is approximated by requiring 3+ distinct profile hashes before a pattern is
 * surfaced, so no individual profile's data is exposed.
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimitResult = await EnhancedRateLimiters.api(request);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: rateLimitResult.retryAfter },
        { status: 429 }
      );
    }

    const auth = await authenticate(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);

    const parsed = querySchema.safeParse({
      query: searchParams.get('query') || undefined,
      topK: searchParams.get('topK') ? Number(searchParams.get('topK')) : undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { query, topK } = parsed.data;

    // If no query provided, list all synchronicity patterns from DB
    if (!query) {
      const patterns = await db
        .select()
        .from(gutPatternsTable)
        .where(eq(gutPatternsTable.pattern_type, 'synchronicity'))
        .orderBy(desc(gutPatternsTable.updated_at))
        .limit(topK ?? 20);

      return NextResponse.json({
        success: true,
        data: patterns.map((p) => ({
          uuid: p.uuid,
          patternType: p.pattern_type ?? '',
          description: p.pattern_description ?? '',
          pattern: p.compressed_pattern ?? '',
          confidence: p.confidence ?? 0,
          occurrenceCount: p.occurrence_count ?? 0,
          successRate: p.success_rate ?? 0,
          uniqueProfileCount: p.unique_profile_count ?? 0,
        })),
      });
    }

    // With query: vector search filtered to synchronicity patterns
    // Over-fetch by 3x since queryIntuition returns all pattern types,
    // then trim to topK after filtering to synchronicity only
    const effectiveTopK = topK ?? 5;
    const result = await queryIntuition(query, effectiveTopK * 3);

    if (!result.success) {
      return NextResponse.json(result, { status: 500 });
    }

    // Filter to synchronicity patterns only, then trim to requested topK
    const filtered = (result.data ?? [])
      .filter((p) => p.patternType === 'synchronicity')
      .slice(0, effectiveTopK);

    return NextResponse.json({ success: true, data: filtered });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
