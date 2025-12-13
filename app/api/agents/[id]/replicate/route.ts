import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import {
  agentLifecycleEventsTable,
  agentsTable,
  AgentState,
  apiKeysTable,
} from '@/db/schema';
import { buildAgentEnv } from '@/lib/agent-helpers';
import { validateAgentName } from '@/lib/agent-name-policy';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';
import { kubernetesService } from '@/lib/services/kubernetes-service';

import { authenticate } from '../../../auth';

/**
 * @swagger
 * /api/agents/{id}/replicate:
 *   post:
 *     summary: Replicate (clone) a PAP agent
 *     description: |
 *       Creates a new agent by cloning the configuration of an existing agent.
 *       The new agent will have:
 *       - Same image, resources, and metadata as source
 *       - Different name and DNS (provided in request)
 *       - Independent lifecycle (NEW state)
 *       - No telemetry history (fresh start)
 *
 *       Use cases:
 *       - Scaling horizontally with same configuration
 *       - Creating test/staging copies
 *       - Disaster recovery (replicate before upgrade)
 *     tags:
 *       - PAP Agents
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The UUID of the source agent to replicate
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name for the new agent (must be DNS-safe)
 *                 pattern: '^[a-z0-9]([-a-z0-9]*[a-z0-9])?$'
 *               description:
 *                 type: string
 *                 description: Optional description for the new agent
 *               deploy:
 *                 type: boolean
 *                 description: Automatically deploy to Kubernetes (default true)
 *                 default: true
 *               overrides:
 *                 type: object
 *                 description: Optional configuration overrides
 *                 properties:
 *                   image:
 *                     type: string
 *                   resources:
 *                     type: object
 *     responses:
 *       200:
 *         description: Successfully replicated agent.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 source_agent:
 *                   type: object
 *                 new_agent:
 *                   type: object
 *                 deployment:
 *                   type: object
 *                   nullable: true
 *       400:
 *         description: Bad Request - Invalid name or name already exists.
 *       401:
 *         description: Unauthorized - Invalid or missing API key.
 *       404:
 *         description: Not Found - Source agent does not exist.
 *       500:
 *         description: Internal Server Error - Failed to replicate agent.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Apply rate limiting (resource-intensive operation - creates new agent + Kubernetes resources)
    const rateLimitResult = await EnhancedRateLimiters.agentIntensive(request);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: rateLimitResult.retryAfter },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimitResult.retryAfter || 60),
            'X-RateLimit-Limit': String(rateLimitResult.limit),
            'X-RateLimit-Remaining': String(rateLimitResult.remaining),
            'X-RateLimit-Reset': new Date(rateLimitResult.reset).toISOString(),
          },
        }
      );
    }

    const auth = await authenticate(request);
    if (auth.error) return auth.error;

    const { id: sourceAgentId } = await params;

    // Parse request body
    const body = await request.json();
    const { name, description, deploy = true, overrides } = body;

    // Validate required fields
    if (!name) {
      return NextResponse.json(
        { error: 'Field "name" is required' },
        { status: 400 }
      );
    }

    // SECURITY: Use centralized name validation (consistent with agent creation)
    const nameValidation = validateAgentName(name);
    if (!nameValidation.ok) {
      return NextResponse.json(
        { error: nameValidation.message },
        { status: 400 }
      );
    }
    const { normalizedName, dnsName } = nameValidation;

    // Fetch source agent
    const sourceAgents = await db
      .select()
      .from(agentsTable)
      .where(
        and(
          eq(agentsTable.uuid, sourceAgentId),
          eq(agentsTable.profile_uuid, auth.activeProfile.uuid)
        )
      )
      .limit(1);

    if (sourceAgents.length === 0) {
      return NextResponse.json(
        { error: 'Source agent not found' },
        { status: 404 }
      );
    }

    const sourceAgent = sourceAgents[0];

    // Clone metadata, applying overrides
    const sourceMetadata = (sourceAgent.metadata as Record<string, unknown>) || {};
    const newMetadata = {
      ...sourceMetadata,
      replicated_from: {
        agent_uuid: sourceAgent.uuid,
        agent_name: sourceAgent.name,
        replicated_at: new Date().toISOString(),
        replicated_by: auth.project.user_id,
      },
      // Apply overrides
      ...(overrides?.image && { image: overrides.image }),
      ...(overrides?.resources && { resources: overrides.resources }),
    };

    // Create new agent in database
    // SECURITY: Use atomic insert with unique constraint instead of check-then-insert
    // to prevent TOCTOU race conditions on dns_name uniqueness
    let newAgent;
    try {
      const [insertedAgent] = await db
        .insert(agentsTable)
        .values([{
          name: normalizedName,
          dns_name: dnsName,
          profile_uuid: auth.activeProfile.uuid,
          state: AgentState.NEW,
          kubernetes_namespace: sourceAgent.kubernetes_namespace || 'agents',
          metadata: {
            ...newMetadata,
            description: description || `Replica of ${sourceAgent.name}`,
          },
        }])
        .returning();
      newAgent = insertedAgent;
    } catch (insertError: unknown) {
      // Handle unique constraint violation (PostgreSQL error code 23505)
      if (
        insertError &&
        typeof insertError === 'object' &&
        'code' in insertError &&
        insertError.code === '23505'
      ) {
        return NextResponse.json(
          { error: `DNS name '${dnsName}' is already registered` },
          { status: 409 }
        );
      }
      throw insertError;
    }

    // Log lifecycle event for new agent
    await db.insert(agentLifecycleEventsTable).values({
      agent_uuid: newAgent.uuid,
      event_type: 'CREATED',
      from_state: null,
      to_state: AgentState.NEW,
      metadata: {
        triggered_by: auth.project.user_id,
        replicated_from: sourceAgent.uuid,
      },
    });

    // Log lifecycle event for source agent
    await db.insert(agentLifecycleEventsTable).values({
      agent_uuid: sourceAgent.uuid,
      event_type: 'REPLICATED',
      from_state: sourceAgent.state,
      to_state: sourceAgent.state, // State doesn't change
      metadata: {
        triggered_by: auth.project.user_id,
        replica_uuid: newAgent.uuid,
        replica_name: newAgent.name,
      },
    });

    let deploymentResult = null;

    // Optionally deploy to Kubernetes
    if (deploy) {
      const image =
        overrides?.image || (sourceMetadata.image as string) || 'nginxinc/nginx-unprivileged:alpine';
      const resources =
        overrides?.resources || (sourceMetadata.resources as Record<string, string>);

      // Note: dnsName in DB is just subdomain (e.g., "dev1"), but K8s Ingress needs full FQDN
      const fullDnsName = `${dnsName}.is.plugged.in`;

      // Get or create API key for the replicated agent
      const apiKeys = await db
        .select()
        .from(apiKeysTable)
        .where(eq(apiKeysTable.project_uuid, auth.project.uuid))
        .limit(1);

      let agentApiKey = apiKeys[0]?.api_key;
      if (!agentApiKey) {
        // Create a new API key if none exists
        const { customAlphabet } = await import('nanoid');
        const nanoid = customAlphabet(
          '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
          64
        );
        agentApiKey = `pg_in_${nanoid(64)}`;
        await db.insert(apiKeysTable).values({
          project_uuid: auth.project.uuid,
          api_key: agentApiKey,
          name: `Agent: ${normalizedName}`,
        });
      }

      // Build environment variables using shared helper (with full FQDN)
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const agentEnv = buildAgentEnv({
        baseUrl,
        agentId: newAgent.uuid,
        normalizedName,
        dnsName: fullDnsName,
        apiKey: agentApiKey,
        template: null, // Replicated agents don't use templates
        envOverrides: null,
      });

      deploymentResult = await kubernetesService.deployAgent({
        name: normalizedName,
        dnsName: fullDnsName,
        namespace: newAgent.kubernetes_namespace || 'agents',
        image,
        resources: resources
          ? {
            cpuRequest: resources.cpu_request,
            memoryRequest: resources.memory_request,
            cpuLimit: resources.cpu_limit,
            memoryLimit: resources.memory_limit,
          }
          : undefined,
        env: agentEnv,
      });

      // Update state based on deployment result
      if (deploymentResult.success) {
        await db
          .update(agentsTable)
          .set({
            state: AgentState.PROVISIONED,
            kubernetes_deployment: normalizedName,
            provisioned_at: new Date(),
          })
          .where(eq(agentsTable.uuid, newAgent.uuid));

        // Log provisioning event
        await db.insert(agentLifecycleEventsTable).values({
          agent_uuid: newAgent.uuid,
          event_type: 'PROVISIONED',
          from_state: AgentState.NEW,
          to_state: AgentState.PROVISIONED,
          metadata: {
            triggered_by: auth.project.user_id,
            kubernetes_result: deploymentResult,
          },
        });
      }
    }

    return NextResponse.json({
      message: `Agent replicated successfully from ${sourceAgent.name}`,
      source_agent: {
        uuid: sourceAgent.uuid,
        name: sourceAgent.name,
        state: sourceAgent.state,
      },
      new_agent: newAgent,
      deployment: deploymentResult,
    });
  } catch (error) {
    console.error('Error replicating agent:', error);
    return NextResponse.json(
      { error: 'Failed to replicate agent' },
      { status: 500 }
    );
  }
}
