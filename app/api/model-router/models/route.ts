import { NextResponse } from 'next/server';

import { authenticate } from '@/app/api/auth';
import { db } from '@/db';
import { aiModelsTable } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * GET /api/model-router/models
 *
 * Fetch available AI models from the database (admin-configured models).
 * Returns models in Model Router API format for compatibility with AgentConfigForm.
 *
 * Security:
 * - Requires authentication via authenticate()
 * - Only returns enabled models (is_enabled = true)
 */
export async function GET(request: Request) {
  // Authenticate user
  const auth = await authenticate(request);
  if ('error' in auth) {
    return auth.error;
  }

  try {
    // Fetch enabled models from database (same source as admin panel)
    const models = await db
      .select()
      .from(aiModelsTable)
      .where(eq(aiModelsTable.is_enabled, true))
      .orderBy(aiModelsTable.sort_order, aiModelsTable.display_name);

    // Transform database models to Model Router API format
    const modelRouterFormat = models.map((model) => ({
      id: model.model_id,
      provider: model.provider,
      name: model.display_name,
      context_window: model.context_length || 128000,
      max_output_tokens: undefined, // Not stored in database yet
      pricing: {
        input: model.input_price,
        output: model.output_price,
      },
    }));

    // Return in Model Router API format (expected by AgentConfigForm)
    return NextResponse.json({
      data: modelRouterFormat,
    });
  } catch (error) {
    console.error('Error fetching models from database:', error);
    return NextResponse.json(
      { error: 'Failed to fetch models' },
      { status: 500 }
    );
  }
}
