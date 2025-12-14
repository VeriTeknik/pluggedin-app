/**
 * Admin Model Services API - Test Service Connection
 *
 * @route POST /api/admin/model-services/[serviceId]/test - Test connection
 */

import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { modelRouterServicesTable, users } from '@/db/schema';
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

type RouteParams = {
  params: Promise<{ serviceId: string }>;
};

/**
 * POST /api/admin/model-services/[serviceId]/test
 * Test connection to a service and update health status
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const admin = await checkAdminAuth();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { serviceId } = await params;

    // Get service
    const [service] = await db
      .select()
      .from(modelRouterServicesTable)
      .where(eq(modelRouterServicesTable.uuid, serviceId))
      .limit(1);

    if (!service) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    const startTime = Date.now();
    let health: Record<string, unknown> | null = null;
    let models: string[] | null = null;
    let error: string | undefined;
    let success = false;

    try {
      // Test health endpoint
      const healthResponse = await fetch(
        `${service.url}${service.health_endpoint}`,
        {
          method: 'GET',
          signal: AbortSignal.timeout(10000),
        }
      );

      if (healthResponse.ok) {
        health = await healthResponse.json();
        success = true;
      } else {
        error = `Health check returned ${healthResponse.status}`;
      }

      // Try to discover models
      if (success) {
        try {
          const modelsResponse = await fetch(
            `${service.url}${service.models_endpoint}`,
            {
              method: 'GET',
              signal: AbortSignal.timeout(10000),
            }
          );

          if (modelsResponse.ok) {
            const modelsData = await modelsResponse.json();
            models = modelsData.models?.map((m: { id: string }) => m.id) || [];
          }
        } catch {
          // Models endpoint is optional
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Connection failed';
    }

    const latency = Date.now() - startTime;

    // Update service health status
    await db
      .update(modelRouterServicesTable)
      .set({
        health_status: success ? 'healthy' : 'unhealthy',
        last_health_check: new Date(),
        last_health_error: error || null,
        avg_latency_ms: latency,
        current_load_percent:
          typeof health?.load_percent === 'number' ? health.load_percent : null,
        updated_at: new Date(),
      })
      .where(eq(modelRouterServicesTable.uuid, serviceId));

    return NextResponse.json({
      success,
      latency_ms: latency,
      health,
      models,
      error,
    });
  } catch (error) {
    console.error('[Admin Model Services API] Error testing service:', error);
    return NextResponse.json(
      { error: 'Failed to test service' },
      { status: 500 }
    );
  }
}
