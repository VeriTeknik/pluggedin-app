/**
 * Admin Model Services API - List and Create Router Services
 *
 * @route GET /api/admin/model-services - List all services
 * @route POST /api/admin/model-services - Create a new service
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

/**
 * Test connection to a service
 */
async function testServiceConnection(
  url: string,
  healthEndpoint: string = '/health',
  modelsEndpoint: string = '/v1/models'
): Promise<{
  success: boolean;
  latency_ms: number;
  health: Record<string, unknown> | null;
  models: string[] | null;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    // Test health endpoint
    const healthResponse = await fetch(`${url}${healthEndpoint}`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    const latency = Date.now() - startTime;

    if (!healthResponse.ok) {
      return {
        success: false,
        latency_ms: latency,
        health: null,
        models: null,
        error: `Health check failed: ${healthResponse.status}`,
      };
    }

    const health = await healthResponse.json();

    // Try to discover models (optional - service may not have models yet)
    let models: string[] | null = null;
    try {
      const modelsResponse = await fetch(`${url}${modelsEndpoint}`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });

      if (modelsResponse.ok) {
        const modelsData = await modelsResponse.json();
        models = modelsData.models?.map((m: { id: string }) => m.id) || [];
      }
    } catch {
      // Models endpoint is optional
    }

    return {
      success: true,
      latency_ms: latency,
      health,
      models,
    };
  } catch (error) {
    return {
      success: false,
      latency_ms: Date.now() - startTime,
      health: null,
      models: null,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

// Service creation schema
const createServiceSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url(),
  region: z.string().optional(),
  health_endpoint: z.string().optional().default('/health'),
  models_endpoint: z.string().optional().default('/v1/models'),
  sync_endpoint: z.string().optional().default('/v1/models/sync'),
  metrics_endpoint: z.string().optional().default('/metrics'),
  capabilities: z.array(z.string()).optional(),
  auth_type: z.enum(['jwt', 'api-key', 'mtls']).optional().default('jwt'),
  auth_secret_name: z.string().optional(),
  priority: z.number().int().min(0).optional().default(100),
  weight: z.number().int().min(0).optional().default(100),
  description: z.string().optional(),
  test_connection: z.boolean().optional().default(true),
  auto_discover_models: z.boolean().optional().default(true),
});

/**
 * GET /api/admin/model-services
 * List all router services with optional filtering
 */
export async function GET(request: NextRequest) {
  const admin = await checkAdminAuth();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const region = searchParams.get('region');
    const healthyOnly = searchParams.get('healthy') === 'true';
    const enabledOnly = searchParams.get('enabled') === 'true';

    let query = db.select().from(modelRouterServicesTable);

    if (region) {
      query = query.where(eq(modelRouterServicesTable.region, region)) as typeof query;
    }

    if (enabledOnly) {
      query = query.where(eq(modelRouterServicesTable.is_enabled, true)) as typeof query;
    }

    if (healthyOnly) {
      query = query.where(eq(modelRouterServicesTable.health_status, 'healthy')) as typeof query;
    }

    const services = await query.orderBy(
      modelRouterServicesTable.priority,
      modelRouterServicesTable.name
    );

    // Get model counts for each service
    const servicesWithCounts = await Promise.all(
      services.map(async (service) => {
        const mappings = await db
          .select()
          .from(modelServiceMappingsTable)
          .where(eq(modelServiceMappingsTable.service_uuid, service.uuid));

        return {
          ...service,
          model_count: mappings.length,
          enabled_model_count: mappings.filter((m) => m.is_enabled).length,
        };
      })
    );

    return NextResponse.json({
      services: servicesWithCounts,
      count: servicesWithCounts.length,
    });
  } catch (error) {
    console.error('[Admin Model Services API] Error listing services:', error);
    return NextResponse.json(
      { error: 'Failed to list services' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/model-services
 * Create a new router service
 */
export async function POST(request: NextRequest) {
  const admin = await checkAdminAuth();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = createServiceSchema.parse(body);

    // Test connection if requested
    let connectionTest = null;
    if (validated.test_connection) {
      connectionTest = await testServiceConnection(
        validated.url,
        validated.health_endpoint,
        validated.models_endpoint
      );

      if (!connectionTest.success) {
        return NextResponse.json(
          {
            error: 'Connection test failed',
            details: connectionTest.error,
            latency_ms: connectionTest.latency_ms,
          },
          { status: 400 }
        );
      }
    }

    // Insert the new service
    const [newService] = await db
      .insert(modelRouterServicesTable)
      .values({
        name: validated.name,
        url: validated.url,
        region: validated.region,
        health_endpoint: validated.health_endpoint,
        models_endpoint: validated.models_endpoint,
        sync_endpoint: validated.sync_endpoint,
        metrics_endpoint: validated.metrics_endpoint,
        capabilities: validated.capabilities,
        auth_type: validated.auth_type,
        auth_secret_name: validated.auth_secret_name,
        priority: validated.priority,
        weight: validated.weight,
        description: validated.description,
        health_status: connectionTest?.success ? 'healthy' : 'unknown',
        avg_latency_ms: connectionTest?.latency_ms,
        last_health_check: connectionTest ? new Date() : null,
      })
      .returning();

    // If auto_discover_models and we found models, create mappings
    let discoveredModels: string[] = [];
    if (validated.auto_discover_models && connectionTest?.models?.length) {
      discoveredModels = connectionTest.models;

      // Find matching models in our database
      for (const modelId of discoveredModels) {
        const existingModel = await db
          .select()
          .from(aiModelsTable)
          .where(eq(aiModelsTable.model_id, modelId))
          .limit(1);

        if (existingModel.length > 0) {
          await db
            .insert(modelServiceMappingsTable)
            .values({
              model_uuid: existingModel[0].uuid,
              service_uuid: newService.uuid,
              is_enabled: true,
            })
            .onConflictDoNothing();
        }
      }
    }

    console.log(
      `[Admin Model Services API] Service created by ${admin.email}: ${validated.name} (${validated.url})`
    );

    return NextResponse.json(
      {
        service: newService,
        connection_test: connectionTest,
        discovered_models: discoveredModels,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Admin Model Services API] Error creating service:', error);

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
      { error: 'Failed to create service' },
      { status: 500 }
    );
  }
}
