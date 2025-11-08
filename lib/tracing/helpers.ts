/**
 * MCP Data Integrity Tracing Helpers
 *
 * Purpose: Track data flow from registry → registry-proxy → app → database
 * to detect any data loss or transformation issues.
 *
 * 6 Hops:
 * 1. registry - Data from official registry
 * 2. registry-proxy - Data output from our proxy
 * 3. app-receive - Data received by pluggedin-app
 * 4. app-transform - Data after transformation
 * 5. app-persist - Data being saved to database
 * 6. database - Data verified from database
 *
 * Only runs when DEBUG_MCP_TRACES=true in environment.
 */

import { db } from '@/db';
import { dataIntegrityTracesTable, dataIntegrityErrorsTable } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

/**
 * Check if tracing is enabled via environment variable
 */
export function isTracingEnabled(): boolean {
  return process.env.DEBUG_MCP_TRACES === 'true';
}

/**
 * Generate SHA-256 checksum of data
 */
function generateChecksum(data: any): string {
  const normalized = JSON.stringify(data, Object.keys(data).sort());
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Extract counts from server data for quick comparison
 */
function extractCounts(data: any): {
  total_servers?: number;
  servers_with_remotes?: number;
  total_remotes?: number;
  remotes_with_headers?: number;
  total_headers?: number;
} {
  const counts: any = {};

  // Handle single server or array of servers
  const servers = Array.isArray(data) ? data : data.servers || [data];

  counts.total_servers = servers.length;

  let serversWithRemotes = 0;
  let totalRemotes = 0;
  let remotesWithHeaders = 0;
  let totalHeaders = 0;

  for (const server of servers) {
    if (server.remotes && Array.isArray(server.remotes) && server.remotes.length > 0) {
      serversWithRemotes++;
      totalRemotes += server.remotes.length;

      for (const remote of server.remotes) {
        if (remote.headers && Array.isArray(remote.headers) && remote.headers.length > 0) {
          remotesWithHeaders++;
          totalHeaders += remote.headers.length;
        }
      }
    }
  }

  counts.servers_with_remotes = serversWithRemotes;
  counts.total_remotes = totalRemotes;
  counts.remotes_with_headers = remotesWithHeaders;
  counts.total_headers = totalHeaders;

  return counts;
}

/**
 * Extract only remotes data for checksum comparison
 */
function extractRemotes(data: any): any[] {
  const servers = Array.isArray(data) ? data : data.servers || [data];
  const allRemotes: any[] = [];

  for (const server of servers) {
    if (server.remotes && Array.isArray(server.remotes)) {
      allRemotes.push(...server.remotes);
    }
  }

  return allRemotes;
}

/**
 * Record a trace event at a specific hop
 *
 * @param trace_id - UUID to track this data flow end-to-end
 * @param hop - Which hop: 'registry', 'registry-proxy', 'app-receive', 'app-transform', 'app-persist', 'database'
 * @param server_name - Optional server name being processed
 * @param server_uuid - Optional server UUID
 * @param event_data - The actual data at this hop (will calculate checksums)
 */
export async function recordTrace(
  trace_id: string,
  hop: string,
  server_name: string | null,
  server_uuid: string | null,
  event_data: any
): Promise<void> {
  if (!isTracingEnabled()) {
    return; // Skip if tracing disabled
  }

  try {
    // Calculate checksums
    const checksum_full = generateChecksum(event_data);
    const remotes = extractRemotes(event_data);
    const checksum_remotes = generateChecksum(remotes);
    const counts = extractCounts(event_data);

    // Prepare event data with checksums
    const enrichedEventData = {
      trace_id,
      hop,
      checksum_full,
      checksum_remotes,
      counts,
      data_sample: typeof event_data === 'object'
        ? JSON.stringify(event_data).substring(0, 500) + '...'
        : String(event_data).substring(0, 500) + '...',
      timestamp: new Date().toISOString(),
    };

    // Insert trace record
    await db.insert(dataIntegrityTracesTable).values({
      trace_id,
      hop,
      server_name,
      server_uuid,
      event_data: enrichedEventData,
    });

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[TRACE] ${hop} - ${trace_id.substring(0, 8)} - Checksum: ${checksum_full.substring(0, 8)}`);
    }
  } catch (error) {
    console.error('[TRACE ERROR] Failed to record trace:', error);
    // Don't throw - tracing failures shouldn't break application flow
  }
}

/**
 * Record a data integrity error
 *
 * @param error_type - Type of error: 'DATA_LOSS_DETECTED', 'HEADERS_DROPPED_IN_TRANSFORM', etc.
 * @param trace_id - UUID of the trace that triggered this error
 * @param server_name - Server name where error occurred
 * @param server_uuid - Server UUID where error occurred
 * @param error_data - Details about the error
 */
export async function recordIntegrityError(
  error_type: string,
  trace_id: string,
  server_name: string | null,
  server_uuid: string | null,
  error_data: any
): Promise<void> {
  if (!isTracingEnabled()) {
    return;
  }

  try {
    await db.insert(dataIntegrityErrorsTable).values({
      error_type,
      trace_id,
      server_name,
      server_uuid,
      error_data: {
        trace_id,
        server_name,
        server_uuid,
        ...error_data,
        detected_at: new Date().toISOString(),
      },
    });

    // Always log errors to console
    console.error(`[INTEGRITY ERROR] ${error_type}:`, {
      trace_id,
      server_name,
      ...error_data,
    });
  } catch (error) {
    console.error('[TRACE ERROR] Failed to record integrity error:', error);
  }
}

/**
 * Generate end-to-end integrity report for a trace
 *
 * Compares checksums across all hops to detect data loss.
 *
 * @param trace_id - UUID of the trace to analyze
 * @returns Integrity report with status and any errors found
 */
export async function generateIntegrityReport(trace_id: string): Promise<{
  trace_id: string;
  status: 'PASS' | 'FAIL';
  hops_found: string[];
  errors: Array<{
    type: string;
    message: string;
    hop_before?: string;
    hop_after?: string;
    details?: any;
  }>;
  checksums: Record<string, { full: string; remotes: string; counts: any }>;
}> {
  if (!isTracingEnabled()) {
    return {
      trace_id,
      status: 'PASS',
      hops_found: [],
      errors: [{ type: 'TRACING_DISABLED', message: 'Tracing is disabled via DEBUG_MCP_TRACES' }],
      checksums: {},
    };
  }

  try {
    // Fetch all traces for this trace_id
    const traces = await db
      .select()
      .from(dataIntegrityTracesTable)
      .where(eq(dataIntegrityTracesTable.trace_id, trace_id))
      .orderBy(dataIntegrityTracesTable.timestamp);

    const hops_found = traces.map((t) => t.hop);
    const checksums: Record<string, any> = {};
    const errors: any[] = [];

    // Extract checksums from each hop
    for (const trace of traces) {
      const eventData = trace.event_data as any;
      checksums[trace.hop] = {
        full: eventData.checksum_full,
        remotes: eventData.checksum_remotes,
        counts: eventData.counts,
      };
    }

    // Compare checksums between consecutive hops
    const expectedFlow = [
      'registry',
      'registry-proxy',
      'app-receive',
      'app-transform',
      'app-persist',
      'database',
    ];

    for (let i = 0; i < traces.length - 1; i++) {
      const currentHop = traces[i];
      const nextHop = traces[i + 1];

      const currentData = currentHop.event_data as any;
      const nextData = nextHop.event_data as any;

      // Check if checksums match
      if (currentData.checksum_full !== nextData.checksum_full) {
        errors.push({
          type: 'DATA_CHANGED',
          message: `Data changed between ${currentHop.hop} and ${nextHop.hop}`,
          hop_before: currentHop.hop,
          hop_after: nextHop.hop,
          details: {
            checksum_before: currentData.checksum_full,
            checksum_after: nextData.checksum_full,
            counts_before: currentData.counts,
            counts_after: nextData.counts,
          },
        });
      }

      // Check if headers were dropped
      if (
        currentData.counts.total_headers > 0 &&
        nextData.counts.total_headers === 0
      ) {
        errors.push({
          type: 'HEADERS_DROPPED',
          message: `Headers were dropped between ${currentHop.hop} and ${nextHop.hop}`,
          hop_before: currentHop.hop,
          hop_after: nextHop.hop,
          details: {
            headers_before: currentData.counts.total_headers,
            headers_after: nextData.counts.total_headers,
          },
        });

        // Record to errors table
        await recordIntegrityError(
          'HEADERS_DROPPED_IN_TRANSFORM',
          trace_id,
          currentHop.server_name,
          currentHop.server_uuid,
          {
            hop_before: currentHop.hop,
            hop_after: nextHop.hop,
            headers_before: currentData.counts.total_headers,
            headers_after: nextData.counts.total_headers,
          }
        );
      }
    }

    // Check if we have all expected hops
    const missingHops = expectedFlow.filter((hop) => !hops_found.includes(hop));
    if (missingHops.length > 0) {
      errors.push({
        type: 'MISSING_HOPS',
        message: `Missing trace hops: ${missingHops.join(', ')}`,
        details: { missing_hops: missingHops },
      });
    }

    // Final verification: compare registry to database
    const registryTrace = traces.find((t) => t.hop === 'registry');
    const databaseTrace = traces.find((t) => t.hop === 'database');

    if (registryTrace && databaseTrace) {
      const registryData = registryTrace.event_data as any;
      const databaseData = databaseTrace.event_data as any;

      if (registryData.checksum_full !== databaseData.checksum_full) {
        errors.push({
          type: 'DATA_LOSS_END_TO_END',
          message: 'Data differs between registry source and final database',
          hop_before: 'registry',
          hop_after: 'database',
          details: {
            checksum_registry: registryData.checksum_full,
            checksum_database: databaseData.checksum_full,
            counts_registry: registryData.counts,
            counts_database: databaseData.counts,
          },
        });

        // Record critical error
        await recordIntegrityError(
          'DATA_LOSS_END_TO_END',
          trace_id,
          registryTrace.server_name,
          registryTrace.server_uuid,
          {
            counts_registry: registryData.counts,
            counts_database: databaseData.counts,
          }
        );
      }
    }

    const status = errors.length === 0 ? 'PASS' : 'FAIL';

    return {
      trace_id,
      status,
      hops_found,
      errors,
      checksums,
    };
  } catch (error) {
    console.error('[TRACE ERROR] Failed to generate integrity report:', error);
    return {
      trace_id,
      status: 'FAIL',
      hops_found: [],
      errors: [
        {
          type: 'REPORT_GENERATION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      ],
      checksums: {},
    };
  }
}

/**
 * Convenience function to start a new trace
 * Returns a trace_id that should be passed through all hops
 */
export function startTrace(): string {
  return crypto.randomUUID();
}
