/**
 * Admin Models API - Individual Model Operations
 *
 * @route GET /api/admin/models/[modelId] - Get a single model
 * @route PATCH /api/admin/models/[modelId] - Update a model
 * @route DELETE /api/admin/models/[modelId] - Delete a model
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
 */
async function checkAdminAuth(): Promise<{ userId: string; email: string } | null> {
  const session = await getAuthSession();

  if (!session?.user?.email || !session?.user?.id) {
    return null;
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  let isAdmin = user?.is_admin || false;

  if (!isAdmin) {
    const adminEmails = getAdminEmails();
    isAdmin = adminEmails.includes(session.user.email);
  }

  if (!isAdmin) {
    return null;
  }

  return { userId: session.user.id, email: session.user.email };
}

// Model update schema (all fields optional)
const updateModelSchema = z.object({
  model_id: z.string().min(1).max(200).optional(), // Allow editing model_id
  display_name: z.string().min(1).max(200).optional(),
  provider: z.nativeEnum(ModelProvider).optional(),
  input_price: z.number().min(0).optional(),
  output_price: z.number().min(0).optional(),
  context_length: z.number().int().min(1).optional(),
  supports_streaming: z.boolean().optional(),
  supports_vision: z.boolean().optional(),
  supports_function_calling: z.boolean().optional(),
  is_enabled: z.boolean().optional(),
  is_default: z.boolean().optional(),
  is_featured: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  aliases: z.array(z.string()).optional(),
  description: z.string().nullable().optional(),
  release_date: z.string().nullable().optional(),
  deprecated_at: z.string().nullable().optional(), // ISO timestamp
  last_test_status: z.enum(['pass', 'fail']).nullable().optional(),
  last_tested_at: z.string().nullable().optional(), // ISO timestamp
});

interface RouteParams {
  params: Promise<{ modelId: string }>;
}

/**
 * GET /api/admin/models/[modelId]
 * Get a single model by UUID or model_id
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const admin = await checkAdminAuth();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { modelId } = await params;

    // Try to find by UUID first, then by model_id
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(modelId);

    const [model] = await db
      .select()
      .from(aiModelsTable)
      .where(
        isUuid
          ? eq(aiModelsTable.uuid, modelId)
          : eq(aiModelsTable.model_id, modelId)
      )
      .limit(1);

    if (!model) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    return NextResponse.json(model);
  } catch (error) {
    console.error('[Admin Models API] Error getting model:', error);
    return NextResponse.json(
      { error: 'Failed to get model' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/models/[modelId]
 * Update a model's properties
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const admin = await checkAdminAuth();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { modelId } = await params;
    const body = await request.json();
    const validated = updateModelSchema.parse(body);

    // Find the model first
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(modelId);

    const [existingModel] = await db
      .select()
      .from(aiModelsTable)
      .where(
        isUuid
          ? eq(aiModelsTable.uuid, modelId)
          : eq(aiModelsTable.model_id, modelId)
      )
      .limit(1);

    if (!existingModel) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    // If setting as default, unset any existing default
    if (validated.is_default === true) {
      await db
        .update(aiModelsTable)
        .set({ is_default: false })
        .where(eq(aiModelsTable.is_default, true));
    }

    // Build update object
    const updateData: Partial<typeof aiModelsTable.$inferInsert> = {
      ...validated,
      updated_at: new Date(),
    };

    // Handle nullable timestamp fields
    if (validated.deprecated_at !== undefined) {
      updateData.deprecated_at = validated.deprecated_at ? new Date(validated.deprecated_at) : null;
    }
    if (validated.last_tested_at !== undefined) {
      updateData.last_tested_at = validated.last_tested_at ? new Date(validated.last_tested_at) : null;
    }

    // Update the model
    const [updatedModel] = await db
      .update(aiModelsTable)
      .set(updateData)
      .where(eq(aiModelsTable.uuid, existingModel.uuid))
      .returning();

    console.log(`[Admin Models API] Model updated by ${admin.email}: ${existingModel.model_id}`);

    return NextResponse.json(updatedModel);
  } catch (error) {
    console.error('[Admin Models API] Error updating model:', error);

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

    return NextResponse.json(
      { error: 'Failed to update model' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/models/[modelId]
 * Delete a model (soft delete by setting deprecated_at, or hard delete)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const admin = await checkAdminAuth();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { modelId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const hardDelete = searchParams.get('hard') === 'true';

    // Find the model first
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(modelId);

    const [existingModel] = await db
      .select()
      .from(aiModelsTable)
      .where(
        isUuid
          ? eq(aiModelsTable.uuid, modelId)
          : eq(aiModelsTable.model_id, modelId)
      )
      .limit(1);

    if (!existingModel) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    if (hardDelete) {
      // Permanently delete
      await db
        .delete(aiModelsTable)
        .where(eq(aiModelsTable.uuid, existingModel.uuid));

      console.log(`[Admin Models API] Model hard deleted by ${admin.email}: ${existingModel.model_id}`);

      return NextResponse.json({ message: 'Model permanently deleted' });
    } else {
      // Soft delete - mark as deprecated and disable
      const [deprecatedModel] = await db
        .update(aiModelsTable)
        .set({
          deprecated_at: new Date(),
          is_enabled: false,
          updated_at: new Date(),
        })
        .where(eq(aiModelsTable.uuid, existingModel.uuid))
        .returning();

      console.log(`[Admin Models API] Model deprecated by ${admin.email}: ${existingModel.model_id}`);

      return NextResponse.json(deprecatedModel);
    }
  } catch (error) {
    console.error('[Admin Models API] Error deleting model:', error);
    return NextResponse.json(
      { error: 'Failed to delete model' },
      { status: 500 }
    );
  }
}
