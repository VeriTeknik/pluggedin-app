/**
 * Admin Model Services API - Single Service Operations
 *
 * @route GET /api/admin/model-services/[serviceId] - Get service details
 * @route PATCH /api/admin/model-services/[serviceId] - Update service
 * @route DELETE /api/admin/model-services/[serviceId] - Delete service
 */

import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import {
  modelRouterServicesTable,
  modelServiceMappingsTable,
  aiModelsTable,
  users,
} from '@/db/schema';
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

// Service update schema
const updateServiceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  url: z.string().url().optional(),
  region: z.string().nullable().optional(),
  health_endpoint: z.string().optional(),
  models_endpoint: z.string().optional(),
  sync_endpoint: z.string().optional(),
  metrics_endpoint: z.string().optional(),
  capabilities: z.array(z.string()).nullable().optional(),
  auth_type: z.enum(['jwt', 'api-key', 'mtls']).optional(),
  auth_secret_name: z.string().nullable().optional(),
  is_enabled: z.boolean().optional(),
  priority: z.number().int().min(0).optional(),
  weight: z.number().int().min(0).optional(),
  description: z.string().nullable().optional(),
});

type RouteParams = {
  params: Promise<{ serviceId: string }>;
};

/**
 * GET /api/admin/model-services/[serviceId]
 * Get service details with model assignments
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const admin = await checkAdminAuth();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { serviceId } = await params;

    const [service] = await db
      .select()
      .from(modelRouterServicesTable)
      .where(eq(modelRouterServicesTable.uuid, serviceId))
      .limit(1);

    if (!service) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    // Get model mappings with model details
    const mappings = await db
      .select({
        mapping: modelServiceMappingsTable,
        model: aiModelsTable,
      })
      .from(modelServiceMappingsTable)
      .innerJoin(
        aiModelsTable,
        eq(modelServiceMappingsTable.model_uuid, aiModelsTable.uuid)
      )
      .where(eq(modelServiceMappingsTable.service_uuid, serviceId));

    return NextResponse.json({
      service,
      models: mappings.map((m) => ({
        mapping_uuid: m.mapping.uuid,
        model_uuid: m.model.uuid,
        model_id: m.model.model_id,
        display_name: m.model.display_name,
        provider: m.model.provider,
        is_enabled: m.mapping.is_enabled,
        priority: m.mapping.priority,
        requests_total: m.mapping.requests_total,
        errors_total: m.mapping.errors_total,
        avg_latency_ms: m.mapping.avg_latency_ms,
      })),
    });
  } catch (error) {
    console.error('[Admin Model Services API] Error getting service:', error);
    return NextResponse.json(
      { error: 'Failed to get service' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/model-services/[serviceId]
 * Update a service
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const admin = await checkAdminAuth();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { serviceId } = await params;
    const body = await request.json();
    const validated = updateServiceSchema.parse(body);

    // Check service exists
    const [existing] = await db
      .select()
      .from(modelRouterServicesTable)
      .where(eq(modelRouterServicesTable.uuid, serviceId))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    // Update the service
    const [updated] = await db
      .update(modelRouterServicesTable)
      .set({
        ...validated,
        updated_at: new Date(),
      })
      .where(eq(modelRouterServicesTable.uuid, serviceId))
      .returning();

    console.log(
      `[Admin Model Services API] Service updated by ${admin.email}: ${updated.name}`
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[Admin Model Services API] Error updating service:', error);

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

    if (error instanceof Error && error.message.includes('unique')) {
      return NextResponse.json(
        { error: 'A service with this URL already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update service' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/model-services/[serviceId]
 * Delete a service (cascades to mappings)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const admin = await checkAdminAuth();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { serviceId } = await params;

    // Check service exists
    const [existing] = await db
      .select()
      .from(modelRouterServicesTable)
      .where(eq(modelRouterServicesTable.uuid, serviceId))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    // Delete (cascades to model_service_mappings)
    await db
      .delete(modelRouterServicesTable)
      .where(eq(modelRouterServicesTable.uuid, serviceId));

    console.log(
      `[Admin Model Services API] Service deleted by ${admin.email}: ${existing.name}`
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Admin Model Services API] Error deleting service:', error);
    return NextResponse.json(
      { error: 'Failed to delete service' },
      { status: 500 }
    );
  }
}
