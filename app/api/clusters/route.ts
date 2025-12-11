/**
 * Clusters API - List and manage PAP Heartbeat Collector clusters
 *
 * GET /api/clusters
 *   - List all registered clusters
 *
 * POST /api/clusters
 *   - Register a new cluster
 */

import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { clustersTable } from '@/db/schema';
import { authenticate } from '@/app/api/auth';

/**
 * Maximum URL length to prevent DoS attacks.
 */
const MAX_URL_LENGTH = 2048;

/**
 * Hosts blocked for SSRF prevention.
 * Includes localhost aliases and cloud metadata endpoints.
 */
const BLOCKED_HOSTS = [
  // Localhost aliases
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
  // AWS metadata
  '169.254.169.254',
  // GCP metadata
  'metadata.google.internal',
  'metadata.goog',
  // Azure metadata
  '169.254.169.254',
  // Kubernetes internal
  'kubernetes.default',
  'kubernetes.default.svc',
];

/**
 * Check if hostname is a private/internal IP address.
 * SECURITY: Prevents SSRF attacks targeting internal infrastructure.
 */
function isPrivateNetwork(hostname: string): boolean {
  // IPv4 private ranges
  const privateIPv4Patterns = [
    /^10\./,                          // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[01])\./,  // 172.16.0.0/12
    /^192\.168\./,                     // 192.168.0.0/16
    /^169\.254\./,                     // Link-local 169.254.0.0/16 (includes AWS metadata)
    /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./, // CGNAT 100.64.0.0/10
  ];

  // IPv6 private ranges
  const privateIPv6Patterns = [
    /^fe80:/i,   // Link-local
    /^fc00:/i,   // Unique local
    /^fd[0-9a-f]{2}:/i, // Unique local
  ];

  for (const pattern of privateIPv4Patterns) {
    if (pattern.test(hostname)) {
      return true;
    }
  }

  for (const pattern of privateIPv6Patterns) {
    if (pattern.test(hostname)) {
      return true;
    }
  }

  return false;
}

/**
 * Validation schema for new cluster registration.
 * SECURITY: collector_url must use HTTPS in production to prevent MITM attacks.
 * SECURITY: Blocks localhost and private IPs to prevent SSRF attacks.
 */
const createClusterSchema = z.object({
  cluster_id: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  collector_url: z
    .string()
    .max(MAX_URL_LENGTH, { message: 'Collector URL is too long' })
    .url()
    .refine(
      (url) => {
        // Allow HTTP only in development for local testing
        const isDevelopment = process.env.NODE_ENV === 'development';
        return isDevelopment || url.startsWith('https://');
      },
      { message: 'Collector URL must use HTTPS in production' }
    )
    .refine(
      (url) => {
        // SSRF prevention: block localhost and loopback
        try {
          const parsed = new URL(url);
          const hostname = parsed.hostname.toLowerCase();

          // Block known localhost aliases
          if (BLOCKED_HOSTS.includes(hostname)) {
            return false;
          }

          // Block private IP ranges (except in development)
          const isDevelopment = process.env.NODE_ENV === 'development';
          if (!isDevelopment && isPrivateNetwork(hostname)) {
            return false;
          }

          return true;
        } catch {
          return false;
        }
      },
      { message: 'Collector URL cannot point to localhost or private networks' }
    )
    .optional(),
});

/**
 * GET /api/clusters
 *
 * List all registered clusters.
 */
export async function GET() {
  try {
    const clusters = await db
      .select()
      .from(clustersTable)
      .orderBy(desc(clustersTable.created_at));

    return NextResponse.json({
      clusters,
      total: clusters.length,
    });
  } catch (error) {
    console.error('[Clusters] Error fetching clusters:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/clusters
 *
 * Register a new cluster.
 * Requires authenticated user.
 */
export async function POST(request: Request) {
  // Authenticate the request
  const auth = await authenticate(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = await request.json();
    const validated = createClusterSchema.parse(body);

    // Check if cluster already exists
    const existing = await db.query.clustersTable.findFirst({
      where: eq(clustersTable.cluster_id, validated.cluster_id),
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Cluster already exists' },
        { status: 409 }
      );
    }

    // Create cluster
    const [cluster] = await db
      .insert(clustersTable)
      .values({
        cluster_id: validated.cluster_id,
        name: validated.name,
        description: validated.description,
        collector_url: validated.collector_url,
      })
      .returning();

    return NextResponse.json({
      cluster,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid cluster data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('[Clusters] Error creating cluster:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
