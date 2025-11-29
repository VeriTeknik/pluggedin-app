import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import {
  agentsTable,
  agentLifecycleEventsTable,
  AgentState,
} from '@/db/schema';

import { authenticate } from '../auth';
import { kubernetesService } from '@/lib/services/kubernetes-service';

/**
 * @swagger
 * /api/agents:
 *   get:
 *     summary: Get all PAP agents for the active profile
 *     description: Retrieves a list of all PAP agents associated with the authenticated user's active profile. Requires API key authentication.
 *     tags:
 *       - PAP Agents
 *     security:
 *       - apiKey: []
 *     responses:
 *       200:
 *         description: Successfully retrieved agents, ordered by creation date descending.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   uuid:
 *                     type: string
 *                     format: uuid
 *                   name:
 *                     type: string
 *                   dns_name:
 *                     type: string
 *                   state:
 *                     type: string
 *                     enum: [NEW, PROVISIONED, ACTIVE, DRAINING, TERMINATED, KILLED]
 *                   created_at:
 *                     type: string
 *                     format: date-time
 *                   last_heartbeat_at:
 *                     type: string
 *                     format: date-time
 *                     nullable: true
 *                   metadata:
 *                     type: object
 *       401:
 *         description: Unauthorized - Invalid or missing API key or active profile not found.
 *       500:
 *         description: Internal Server Error - Failed to fetch agents.
 */
export async function GET(request: Request) {
  try {
    const auth = await authenticate(request);
    if (auth.error) return auth.error;

    const agents = await db
      .select({
        uuid: agentsTable.uuid,
        name: agentsTable.name,
        dns_name: agentsTable.dns_name,
        state: agentsTable.state,
        kubernetes_namespace: agentsTable.kubernetes_namespace,
        kubernetes_deployment: agentsTable.kubernetes_deployment,
        created_at: agentsTable.created_at,
        provisioned_at: agentsTable.provisioned_at,
        activated_at: agentsTable.activated_at,
        terminated_at: agentsTable.terminated_at,
        last_heartbeat_at: agentsTable.last_heartbeat_at,
        metadata: agentsTable.metadata,
      })
      .from(agentsTable)
      .where(eq(agentsTable.profile_uuid, auth.activeProfile.uuid))
      .orderBy(desc(agentsTable.created_at));

    return NextResponse.json(agents);
  } catch (error) {
    console.error('Error fetching agents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agents' },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/agents:
 *   post:
 *     summary: Create a new PAP agent
 *     description: Creates a new PAP agent and deploys it to Kubernetes. Requires API key authentication. The agent will be deployed to the is.plugged.in cluster with automatic TLS certificates.
 *     tags:
 *       - PAP Agents
 *     security:
 *       - apiKey: []
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
 *                 description: DNS-safe agent name (e.g., 'focus', 'memory'). Must be unique.
 *               description:
 *                 type: string
 *                 nullable: true
 *                 description: Optional description for the agent.
 *               image:
 *                 type: string
 *                 nullable: true
 *                 description: Container image to use. Defaults to nginx-unprivileged for testing.
 *               resources:
 *                 type: object
 *                 nullable: true
 *                 properties:
 *                   cpu_request:
 *                     type: string
 *                     description: CPU request (e.g., '100m')
 *                   memory_request:
 *                     type: string
 *                     description: Memory request (e.g., '256Mi')
 *                   cpu_limit:
 *                     type: string
 *                     description: CPU limit (e.g., '1000m')
 *                   memory_limit:
 *                     type: string
 *                     description: Memory limit (e.g., '1Gi')
 *     responses:
 *       200:
 *         description: Successfully created the agent and initiated Kubernetes deployment.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 agent:
 *                   type: object
 *                   description: The created agent record
 *                 deployment:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                     message:
 *                       type: string
 *       400:
 *         description: Bad Request - Missing required fields or validation failed.
 *       401:
 *         description: Unauthorized - Invalid or missing API key or active profile not found.
 *       409:
 *         description: Conflict - Agent with this name already exists.
 *       500:
 *         description: Internal Server Error - Failed to create the agent.
 */
export async function POST(request: Request) {
  try {
    const auth = await authenticate(request);
    if (auth.error) return auth.error;

    const body = await request.json();
    const { name, description, image, resources } = body;

    // Validate required fields
    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    // Validate DNS-safe name (lowercase alphanumeric and hyphens only)
    const dnsNameRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
    if (!dnsNameRegex.test(name)) {
      return NextResponse.json(
        { error: 'Name must be DNS-safe: lowercase alphanumeric and hyphens only' },
        { status: 400 }
      );
    }

    // Generate DNS name: {name}.is.plugged.in
    const dnsName = `${name}.is.plugged.in`;

    // Check if agent with this name already exists
    const existing = await db
      .select()
      .from(agentsTable)
      .where(
        and(
          eq(agentsTable.name, name),
          eq(agentsTable.profile_uuid, auth.activeProfile.uuid)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'Agent with this name already exists' },
        { status: 409 }
      );
    }

    // Create agent in database with NEW state
    const [newAgent] = await db
      .insert(agentsTable)
      .values({
        name,
        dns_name: dnsName,
        profile_uuid: auth.activeProfile.uuid,
        state: AgentState.NEW,
        kubernetes_namespace: 'agents',
        kubernetes_deployment: name,
        metadata: {
          description,
          image,
          resources,
        },
      })
      .returning();

    // Log lifecycle event
    await db.insert(agentLifecycleEventsTable).values({
      agent_uuid: newAgent.uuid,
      event_type: 'CREATED',
      from_state: null,
      to_state: AgentState.NEW,
      metadata: {
        triggered_by: auth.project.user_id,
        profile_uuid: auth.activeProfile.uuid,
      },
    });

    // Deploy to Kubernetes
    const deploymentResult = await kubernetesService.deployAgent({
      name,
      dnsName,
      namespace: 'agents',
      image,
      resources: resources ? {
        cpuRequest: resources.cpu_request,
        memoryRequest: resources.memory_request,
        cpuLimit: resources.cpu_limit,
        memoryLimit: resources.memory_limit,
      } : undefined,
    });

    // Update agent state based on deployment result
    if (deploymentResult.success) {
      await db
        .update(agentsTable)
        .set({
          state: AgentState.PROVISIONED,
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
          triggered_by: 'system',
          kubernetes_deployment: name,
        },
      });
    } else {
      // Log error event
      await db.insert(agentLifecycleEventsTable).values({
        agent_uuid: newAgent.uuid,
        event_type: 'ERROR',
        from_state: AgentState.NEW,
        to_state: AgentState.NEW,
        metadata: {
          error_message: deploymentResult.message,
          triggered_by: 'system',
        },
      });
    }

    return NextResponse.json({
      agent: newAgent,
      deployment: deploymentResult,
    });
  } catch (error) {
    console.error('Error creating agent:', error);
    return NextResponse.json(
      { error: 'Failed to create agent' },
      { status: 500 }
    );
  }
}
