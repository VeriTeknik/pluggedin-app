/**
 * Service Router
 *
 * Routes agent requests to the optimal model router service based on:
 * - Health status
 * - Latency
 * - Load
 * - Region preference
 * - Model availability
 */

import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import {
  aiModelsTable,
  modelRouterServicesTable,
  modelServiceMappingsTable,
} from '@/db/schema';

export interface RoutingResult {
  service_uuid: string;
  service_url: string;
  service_name: string;
  region: string | null;
  latency_ms: number;
  load_percent: number | null;
}

export interface RoutingOptions {
  preferredRegion?: string;
  requiredCapabilities?: string[];
  excludeServices?: string[]; // UUIDs to exclude (e.g., for retry)
}

/**
 * Get the best available service for a specific model
 *
 * Scoring algorithm:
 * - Region match: +1000 points
 * - Lower latency: +100 - (latency_ms / 5) points
 * - Lower load: +100 - load_percent points
 * - Lower priority value: -(priority / 10) points
 *
 * Returns null if no healthy service supports the model
 */
export async function getBestServiceForModel(
  modelId: string,
  options?: RoutingOptions
): Promise<RoutingResult | null> {
  // Get model UUID by model_id
  const [model] = await db
    .select({ uuid: aiModelsTable.uuid })
    .from(aiModelsTable)
    .where(eq(aiModelsTable.model_id, modelId))
    .limit(1);

  if (!model) {
    // Model not found, return null
    return null;
  }

  // Get all healthy services that support this model
  const services = await db
    .select({
      service_uuid: modelRouterServicesTable.uuid,
      service_url: modelRouterServicesTable.url,
      service_name: modelRouterServicesTable.name,
      region: modelRouterServicesTable.region,
      capabilities: modelRouterServicesTable.capabilities,
      avg_latency_ms: modelRouterServicesTable.avg_latency_ms,
      current_load_percent: modelRouterServicesTable.current_load_percent,
      service_priority: modelRouterServicesTable.priority,
      service_weight: modelRouterServicesTable.weight,
      mapping_priority: modelServiceMappingsTable.priority,
    })
    .from(modelServiceMappingsTable)
    .innerJoin(
      modelRouterServicesTable,
      eq(modelServiceMappingsTable.service_uuid, modelRouterServicesTable.uuid)
    )
    .where(
      and(
        eq(modelServiceMappingsTable.model_uuid, model.uuid),
        eq(modelServiceMappingsTable.is_enabled, true),
        eq(modelRouterServicesTable.is_enabled, true),
        eq(modelRouterServicesTable.health_status, 'healthy')
      )
    );

  if (!services.length) {
    return null;
  }

  // Filter out excluded services
  let candidates = services;
  if (options?.excludeServices?.length) {
    candidates = candidates.filter(
      (s) => !options.excludeServices!.includes(s.service_uuid)
    );
  }

  // Filter by required capabilities
  if (options?.requiredCapabilities?.length) {
    candidates = candidates.filter((s) =>
      options.requiredCapabilities!.every((c) => s.capabilities?.includes(c))
    );
  }

  if (!candidates.length) {
    return null;
  }

  // Score each candidate
  const scored = candidates.map((s) => {
    let score = 0;

    // Region match bonus (big impact)
    if (options?.preferredRegion && s.region === options.preferredRegion) {
      score += 1000;
    }

    // Lower latency = higher score (normalized to ~0-100)
    const latencyScore = Math.max(0, 100 - (s.avg_latency_ms || 100) / 5);
    score += latencyScore;

    // Lower load = higher score (0-100)
    const loadScore = Math.max(0, 100 - (s.current_load_percent || 50));
    score += loadScore;

    // Priority (lower = better, so subtract; mapping priority overrides service)
    const effectivePriority = s.mapping_priority ?? s.service_priority ?? 100;
    score -= effectivePriority / 10;

    return { ...s, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Return the best candidate
  const best = scored[0];

  return {
    service_uuid: best.service_uuid,
    service_url: best.service_url,
    service_name: best.service_name,
    region: best.region,
    latency_ms: best.avg_latency_ms || 0,
    load_percent: best.current_load_percent,
  };
}

/**
 * Get all available services for a model (for fallback/retry scenarios)
 *
 * Returns services sorted by score (best first)
 */
export async function getAllServicesForModel(
  modelId: string,
  options?: RoutingOptions
): Promise<RoutingResult[]> {
  const [model] = await db
    .select({ uuid: aiModelsTable.uuid })
    .from(aiModelsTable)
    .where(eq(aiModelsTable.model_id, modelId))
    .limit(1);

  if (!model) {
    return [];
  }

  const services = await db
    .select({
      service_uuid: modelRouterServicesTable.uuid,
      service_url: modelRouterServicesTable.url,
      service_name: modelRouterServicesTable.name,
      region: modelRouterServicesTable.region,
      capabilities: modelRouterServicesTable.capabilities,
      avg_latency_ms: modelRouterServicesTable.avg_latency_ms,
      current_load_percent: modelRouterServicesTable.current_load_percent,
      service_priority: modelRouterServicesTable.priority,
      mapping_priority: modelServiceMappingsTable.priority,
    })
    .from(modelServiceMappingsTable)
    .innerJoin(
      modelRouterServicesTable,
      eq(modelServiceMappingsTable.service_uuid, modelRouterServicesTable.uuid)
    )
    .where(
      and(
        eq(modelServiceMappingsTable.model_uuid, model.uuid),
        eq(modelServiceMappingsTable.is_enabled, true),
        eq(modelRouterServicesTable.is_enabled, true),
        eq(modelRouterServicesTable.health_status, 'healthy')
      )
    );

  // Filter by capabilities
  let candidates = services;
  if (options?.requiredCapabilities?.length) {
    candidates = candidates.filter((s) =>
      options.requiredCapabilities!.every((c) => s.capabilities?.includes(c))
    );
  }

  // Score and sort
  const scored = candidates.map((s) => {
    let score = 0;
    if (options?.preferredRegion && s.region === options.preferredRegion) {
      score += 1000;
    }
    score += Math.max(0, 100 - (s.avg_latency_ms || 100) / 5);
    score += Math.max(0, 100 - (s.current_load_percent || 50));
    const effectivePriority = s.mapping_priority ?? s.service_priority ?? 100;
    score -= effectivePriority / 10;
    return { ...s, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.map((s) => ({
    service_uuid: s.service_uuid,
    service_url: s.service_url,
    service_name: s.service_name,
    region: s.region,
    latency_ms: s.avg_latency_ms || 0,
    load_percent: s.current_load_percent,
  }));
}

/**
 * Get list of models available on any healthy service
 *
 * Useful for populating model selection dropdowns
 */
export async function getAvailableModels(): Promise<
  Array<{
    model_id: string;
    display_name: string;
    provider: string;
    service_count: number;
  }>
> {
  // Get all models that have at least one healthy service mapping
  const models = await db
    .selectDistinct({
      model_id: aiModelsTable.model_id,
      display_name: aiModelsTable.display_name,
      provider: aiModelsTable.provider,
    })
    .from(aiModelsTable)
    .innerJoin(
      modelServiceMappingsTable,
      eq(aiModelsTable.uuid, modelServiceMappingsTable.model_uuid)
    )
    .innerJoin(
      modelRouterServicesTable,
      eq(modelServiceMappingsTable.service_uuid, modelRouterServicesTable.uuid)
    )
    .where(
      and(
        eq(aiModelsTable.is_enabled, true),
        eq(modelServiceMappingsTable.is_enabled, true),
        eq(modelRouterServicesTable.is_enabled, true),
        eq(modelRouterServicesTable.health_status, 'healthy')
      )
    );

  // Count services for each model
  const modelCounts = await db
    .select({
      model_id: aiModelsTable.model_id,
    })
    .from(modelServiceMappingsTable)
    .innerJoin(
      aiModelsTable,
      eq(modelServiceMappingsTable.model_uuid, aiModelsTable.uuid)
    )
    .innerJoin(
      modelRouterServicesTable,
      eq(modelServiceMappingsTable.service_uuid, modelRouterServicesTable.uuid)
    )
    .where(
      and(
        eq(modelServiceMappingsTable.is_enabled, true),
        eq(modelRouterServicesTable.is_enabled, true),
        eq(modelRouterServicesTable.health_status, 'healthy')
      )
    );

  const countMap = new Map<string, number>();
  for (const row of modelCounts) {
    countMap.set(row.model_id, (countMap.get(row.model_id) || 0) + 1);
  }

  return models.map((m) => ({
    model_id: m.model_id,
    display_name: m.display_name,
    provider: m.provider,
    service_count: countMap.get(m.model_id) || 0,
  }));
}

/**
 * Record a request result for a model-service mapping
 *
 * Used to track request stats and adjust routing decisions
 */
export async function recordRequestResult(
  modelId: string,
  serviceUuid: string,
  success: boolean,
  latencyMs?: number
): Promise<void> {
  const [model] = await db
    .select({ uuid: aiModelsTable.uuid })
    .from(aiModelsTable)
    .where(eq(aiModelsTable.model_id, modelId))
    .limit(1);

  if (!model) return;

  // Get current mapping stats
  const [mapping] = await db
    .select()
    .from(modelServiceMappingsTable)
    .where(
      and(
        eq(modelServiceMappingsTable.model_uuid, model.uuid),
        eq(modelServiceMappingsTable.service_uuid, serviceUuid)
      )
    )
    .limit(1);

  if (!mapping) return;

  // Update stats
  const requestsTotal = (mapping.requests_total || 0) + 1;
  const errorsTotal = (mapping.errors_total || 0) + (success ? 0 : 1);

  // Calculate rolling average latency
  let avgLatencyMs = mapping.avg_latency_ms;
  if (latencyMs !== undefined) {
    if (avgLatencyMs === null) {
      avgLatencyMs = latencyMs;
    } else {
      // Exponential moving average with alpha = 0.1
      avgLatencyMs = Math.round(avgLatencyMs * 0.9 + latencyMs * 0.1);
    }
  }

  await db
    .update(modelServiceMappingsTable)
    .set({
      requests_total: requestsTotal,
      errors_total: errorsTotal,
      avg_latency_ms: avgLatencyMs,
    })
    .where(
      and(
        eq(modelServiceMappingsTable.model_uuid, model.uuid),
        eq(modelServiceMappingsTable.service_uuid, serviceUuid)
      )
    );
}
