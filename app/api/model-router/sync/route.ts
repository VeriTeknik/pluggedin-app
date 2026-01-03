import { NextResponse } from 'next/server';

import { db } from '@/db';
import { aiModelsTable, modelRouterServicesTable } from '@/db/schema';
import { eq } from 'drizzle-orm';
import * as jose from 'jose';

/**
 * POST /api/model-router/sync
 *
 * Syncs enabled models from database to all enabled Model Router services.
 * Called automatically when admin changes models (add/edit/toggle).
 *
 * Flow:
 * 1. Fetch all enabled models from aiModelsTable
 * 2. Fetch all enabled Model Router services
 * 3. For each service, POST models to sync_endpoint
 * 4. Update last_model_sync and model_sync_status
 *
 * Returns:
 * - success: boolean
 * - synced_services: number (how many services were synced)
 * - failed_services: array of service names that failed
 */
export async function POST() {
  try {
    // 1. Fetch all enabled models
    const enabledModels = await db
      .select()
      .from(aiModelsTable)
      .where(eq(aiModelsTable.is_enabled, true))
      .orderBy(aiModelsTable.sort_order, aiModelsTable.display_name);

    if (enabledModels.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No enabled models to sync',
        synced_services: 0,
        failed_services: [],
      });
    }

    // 2. Fetch all enabled Model Router services
    const services = await db
      .select()
      .from(modelRouterServicesTable)
      .where(eq(modelRouterServicesTable.is_enabled, true));

    if (services.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No enabled Model Router services to sync to',
        synced_services: 0,
        failed_services: [],
      });
    }

    // 3. Transform models to sync format
    const modelsPayload = enabledModels.map((model) => ({
      id: model.model_id,
      provider: model.provider,
      display_name: model.display_name,
      input_price: model.input_price,
      output_price: model.output_price,
      context_length: model.context_length,
      supports_streaming: model.supports_streaming,
      supports_vision: model.supports_vision,
      supports_function_calling: model.supports_function_calling,
      is_default: model.is_default,
      sort_order: model.sort_order,
      aliases: model.aliases,
      description: model.description,
      release_date: model.release_date,
    }));

    // 4. Sync to each service
    const syncResults = await Promise.allSettled(
      services.map(async (service) => {
        const syncUrl = `${service.url}${service.sync_endpoint || '/admin/sync'}`;

        // Generate admin JWT token for this sync operation
        const MODEL_ROUTER_JWT_SECRET = process.env.MODEL_ROUTER_JWT_SECRET;
        if (!MODEL_ROUTER_JWT_SECRET) {
          throw new Error('MODEL_ROUTER_JWT_SECRET not configured');
        }

        const secret = new TextEncoder().encode(MODEL_ROUTER_JWT_SECRET);
        const token = await new jose.SignJWT({
          admin: true,
          sub: 'pluggedin-app',
        })
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuedAt()
          .setExpirationTime('5m') // 5 minutes for admin sync operations
          .setIssuer('plugged.in')
          .sign(secret);

        // POST to service's sync endpoint
        const response = await fetch(syncUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            models: modelsPayload,
            sync_timestamp: new Date().toISOString(),
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Update service sync status in database
        await db
          .update(modelRouterServicesTable)
          .set({
            last_model_sync: new Date(),
            model_sync_status: 'synced',
            updated_at: new Date(),
          })
          .where(eq(modelRouterServicesTable.uuid, service.uuid));

        return { service: service.name, success: true };
      })
    );

    // 5. Collect results
    const successCount = syncResults.filter((r) => r.status === 'fulfilled').length;
    const failedServices = syncResults
      .filter((r) => r.status === 'rejected')
      .map((r, idx) => ({
        name: services[idx].name,
        error: r.status === 'rejected' ? r.reason.message : 'Unknown error',
      }));

    // Update failed services in database
    for (const failed of failedServices) {
      const service = services.find((s) => s.name === failed.name);
      if (service) {
        await db
          .update(modelRouterServicesTable)
          .set({
            model_sync_status: 'failed',
            last_health_error: failed.error,
            updated_at: new Date(),
          })
          .where(eq(modelRouterServicesTable.uuid, service.uuid));
      }
    }

    console.log(
      `[Model Router Sync] Synced ${successCount}/${services.length} services. Models: ${enabledModels.length}`
    );

    return NextResponse.json({
      success: successCount > 0,
      message: `Synced ${successCount}/${services.length} services`,
      synced_services: successCount,
      failed_services: failedServices,
      models_count: enabledModels.length,
    });
  } catch (error) {
    console.error('[Model Router Sync] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to sync models',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
