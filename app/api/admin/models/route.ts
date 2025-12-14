/**
 * Admin Models API - List and Create AI Models
 *
 * @route GET /api/admin/models - List all models
 * @route POST /api/admin/models - Create a new model
 */

import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { aiModelsTable, ModelProvider, users } from '@/db/schema';
import { getAdminEmails } from '@/lib/admin-notifications';
import { getAuthSession } from '@/lib/auth';

/**
 * Check if the current user is an admin.
 * Returns user info if admin, null otherwise.
 */
async function checkAdminAuth(): Promise<{ userId: string; email: string } | null> {
  const session = await getAuthSession();

  if (!session?.user?.email || !session?.user?.id) {
    return null;
  }

  // Check database for admin status first
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  let isAdmin = user?.is_admin || false;

  // Fallback to environment variable check
  if (!isAdmin) {
    const adminEmails = getAdminEmails();
    isAdmin = adminEmails.includes(session.user.email);
  }

  if (!isAdmin) {
    return null;
  }

  return { userId: session.user.id, email: session.user.email };
}

// Model creation schema
const createModelSchema = z.object({
  model_id: z.string().min(1).max(100),
  display_name: z.string().min(1).max(200),
  provider: z.nativeEnum(ModelProvider),
  input_price: z.number().min(0),
  output_price: z.number().min(0),
  context_length: z.number().int().min(1).optional().default(128000),
  supports_streaming: z.boolean().optional().default(true),
  supports_vision: z.boolean().optional().default(false),
  supports_function_calling: z.boolean().optional().default(true),
  is_enabled: z.boolean().optional().default(true),
  is_default: z.boolean().optional().default(false),
  sort_order: z.number().int().optional().default(0),
  aliases: z.array(z.string()).optional(),
  description: z.string().optional(),
  release_date: z.string().optional(), // ISO date string
});

/**
 * GET /api/admin/models
 * List all AI models with optional filtering
 */
export async function GET(request: NextRequest) {
  const admin = await checkAdminAuth();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const provider = searchParams.get('provider');
    const enabledOnly = searchParams.get('enabled') === 'true';

    let query = db.select().from(aiModelsTable);

    // Apply filters if specified
    if (provider && Object.values(ModelProvider).includes(provider as ModelProvider)) {
      query = query.where(eq(aiModelsTable.provider, provider as ModelProvider)) as typeof query;
    }

    if (enabledOnly) {
      query = query.where(eq(aiModelsTable.is_enabled, true)) as typeof query;
    }

    const models = await query.orderBy(aiModelsTable.sort_order, aiModelsTable.display_name);

    return NextResponse.json({
      models,
      count: models.length,
    });
  } catch (error) {
    console.error('[Admin Models API] Error listing models:', error);
    return NextResponse.json(
      { error: 'Failed to list models' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/models
 * Create a new AI model
 */
export async function POST(request: NextRequest) {
  const admin = await checkAdminAuth();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = createModelSchema.parse(body);

    // If setting as default, unset any existing default
    if (validated.is_default) {
      await db
        .update(aiModelsTable)
        .set({ is_default: false })
        .where(eq(aiModelsTable.is_default, true));
    }

    // Insert the new model
    const [newModel] = await db
      .insert(aiModelsTable)
      .values({
        model_id: validated.model_id,
        display_name: validated.display_name,
        provider: validated.provider,
        input_price: validated.input_price,
        output_price: validated.output_price,
        context_length: validated.context_length,
        supports_streaming: validated.supports_streaming,
        supports_vision: validated.supports_vision,
        supports_function_calling: validated.supports_function_calling,
        is_enabled: validated.is_enabled,
        is_default: validated.is_default,
        sort_order: validated.sort_order,
        aliases: validated.aliases,
        description: validated.description,
        release_date: validated.release_date,
      })
      .returning();

    console.log(`[Admin Models API] Model created by ${admin.email}: ${validated.model_id}`);

    return NextResponse.json(newModel, { status: 201 });
  } catch (error) {
    console.error('[Admin Models API] Error creating model:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Validation error',
          details: error.errors.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    // Check for unique constraint violation
    if (error instanceof Error && error.message.includes('unique')) {
      return NextResponse.json(
        { error: 'A model with this ID already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create model' },
      { status: 500 }
    );
  }
}
