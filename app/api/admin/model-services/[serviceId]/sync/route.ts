/**
 * Admin Model Services API - Sync Models to Service
 *
 * @route POST /api/admin/model-services/[serviceId]/sync - Push models to service
 */

import { and, eq, inArray } from 'drizzle-orm';
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

// Sync request schema
const syncRequestSchema = z.object({
  model_uuids: z.array(z.string().uuid()).optional(), // Specific models to sync
});

type RouteParams = {
  params: Promise<{ serviceId: string }>;
};

/**
 * POST /api/admin/model-services/[serviceId]/sync
 * Push model definitions to a service
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const admin = await checkAdminAuth();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { serviceId } = await params;
    const body = await request.json().catch(() => ({}));
    const validated = syncRequestSchema.parse(body);

    // Get service
    const [service] = await db
      .select()
      .from(modelRouterServicesTable)
      .where(eq(modelRouterServicesTable.uuid, serviceId))
      .limit(1);

    if (!service) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    // Get models to sync
    const whereConditions = validated.model_uuids?.length
      ? and(
          eq(aiModelsTable.is_enabled, true),
          inArray(aiModelsTable.uuid, validated.model_uuids)
        )
      : eq(aiModelsTable.is_enabled, true);

    const models = await db
      .select()
      .from(aiModelsTable)
      .where(whereConditions);

    if (models.length === 0) {
      return NextResponse.json(
        { error: 'No models to sync' },
        { status: 400 }
      );
    }

    const sync_id = crypto.randomUUID();

    // Build sync payload
    const payload = {
      models: models.map((m) => ({
        model_id: m.model_id,
        provider: m.provider,
        input_price: m.input_price,
        output_price: m.output_price,
        context_length: m.context_length,
        capabilities: [
          m.supports_streaming && 'streaming',
          m.supports_vision && 'vision',
          m.supports_function_calling && 'function-calling',
        ].filter(Boolean),
      })),
      sync_id,
    };

    // Send to service
    let accepted: string[] = [];
    let rejected: Array<{ model_id: string; reason: string }> = [];
    let syncError: string | undefined;

    try {
      const response = await fetch(`${service.url}${service.sync_endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // TODO: Add auth headers based on service.auth_type
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000), // 30s timeout for sync
      });

      if (response.ok) {
        const result = await response.json();
        accepted = result.accepted || [];
        rejected = result.rejected || [];
      } else {
        // If service doesn't have sync endpoint, treat all as accepted
        // (service may not implement sync yet)
        if (response.status === 404) {
          accepted = models.map((m) => m.model_id);
        } else {
          syncError = `Sync request failed: ${response.status}`;
        }
      }
    } catch (e) {
      // If connection fails, still create mappings for local tracking
      // This allows admin to pre-configure models before service is deployed
      accepted = models.map((m) => m.model_id);
      syncError = e instanceof Error ? e.message : 'Sync request failed';
    }

    // Create/update mappings for accepted models
    for (const modelId of accepted) {
      const model = models.find((m) => m.model_id === modelId);
      if (model) {
        // Upsert mapping
        await db
          .insert(modelServiceMappingsTable)
          .values({
            model_uuid: model.uuid,
            service_uuid: serviceId,
            is_enabled: true,
          })
          .onConflictDoNothing();
      }
    }

    // Update service sync status
    const syncStatus =
      rejected.length > 0
        ? 'partial'
        : syncError
          ? 'failed'
          : 'synced';

    await db
      .update(modelRouterServicesTable)
      .set({
        last_model_sync: new Date(),
        model_sync_status: syncStatus,
        updated_at: new Date(),
      })
      .where(eq(modelRouterServicesTable.uuid, serviceId));

    console.log(
      `[Admin Model Services API] Models synced to ${service.name} by ${admin.email}: ${accepted.length} accepted, ${rejected.length} rejected`
    );

    return NextResponse.json({
      sync_id,
      service_uuid: serviceId,
      models_pushed: models.length,
      accepted,
      rejected,
      sync_error: syncError,
      status: syncStatus,
    });
  } catch (error) {
    console.error('[Admin Model Services API] Error syncing models:', error);

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
      { error: 'Failed to sync models' },
      { status: 500 }
    );
  }
}
