import { and, desc, eq, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import {
  agentsTable,
  agentTemplatesTable,
  agentLifecycleEventsTable,
  apiKeysTable,
  AgentState,
  AccessLevel,
} from '@/db/schema';

import { authenticate } from '../auth';
import { kubernetesService } from '@/lib/services/kubernetes-service';
import { serializeForJson } from '@/lib/serialize-for-json';
import { validateAgentName } from '@/lib/agent-name-policy';
import { buildAgentEnv } from '@/lib/agent-helpers';

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
        access_level: agentsTable.access_level,
        template_uuid: agentsTable.template_uuid,
        heartbeat_mode: agentsTable.heartbeat_mode,
        deployment_status: agentsTable.deployment_status,
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

    return NextResponse.json(serializeForJson(agents));
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
 *     description: |
 *       Creates a new PAP agent and deploys it to Kubernetes.
 *       Supports two modes:
 *       1. **From Template**: Provide `template_uuid` to deploy from a marketplace template
 *       2. **Custom**: Provide `image` and other settings directly
 *
 *       The agent will be deployed to the is.plugged.in cluster with automatic TLS certificates.
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
 *               template_uuid:
 *                 type: string
 *                 format: uuid
 *                 description: UUID of a marketplace template to deploy from.
 *               access_level:
 *                 type: string
 *                 enum: [PRIVATE, PUBLIC]
 *                 description: Access level (default PRIVATE). PUBLIC enables link sharing.
 *               description:
 *                 type: string
 *                 nullable: true
 *                 description: Optional description for the agent.
 *               image:
 *                 type: string
 *                 nullable: true
 *                 description: Container image to use. If template_uuid provided, overrides template default.
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
 *               env_overrides:
 *                 type: object
 *                 description: Environment variable overrides (merged with template defaults)
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
 *                 template:
 *                   type: object
 *                   description: Template details (if deployed from template)
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
 *       404:
 *         description: Not Found - Template not found.
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
    const { name, template_uuid, access_level, description, image, resources, env_overrides } = body;

    // Load template if provided
    let template = null;
    if (template_uuid) {
      const templates = await db
        .select()
        .from(agentTemplatesTable)
        .where(eq(agentTemplatesTable.uuid, template_uuid))
        .limit(1);

      if (templates.length === 0) {
        return NextResponse.json(
          { error: 'Template not found' },
          { status: 404 }
        );
      }
      template = templates[0];
    }

    // Validate access_level if provided
    if (access_level !== undefined) {
      const validAccessLevels = Object.values(AccessLevel);
      if (!validAccessLevels.includes(access_level)) {
        return NextResponse.json(
          { error: `Invalid access_level. Must be one of: ${validAccessLevels.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // Validate and normalize agent name using shared policy
    const nameValidation = validateAgentName(name);
    if (!nameValidation.ok) {
      return NextResponse.json(
        { error: nameValidation.message },
        { status: 400 }
      );
    }
    const { normalizedName, dnsName } = nameValidation;

    // Check if agent with this DNS name already exists GLOBALLY (across all profiles)
    // DNS names must be unique across the entire system
    const existingGlobal = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.dns_name, dnsName))
      .limit(1);

    if (existingGlobal.length > 0) {
      return NextResponse.json(
        { error: `DNS name '${dnsName}' is already registered` },
        { status: 409 }
      );
    }

    // Resolve image: explicit > template > default
    const resolvedImage = image || template?.docker_image || undefined;

    // Create agent in database with NEW state
    const [newAgent] = await db
      .insert(agentsTable)
      .values({
        name: normalizedName,
        dns_name: dnsName,
        profile_uuid: auth.activeProfile.uuid,
        template_uuid: template?.uuid || null,
        access_level: access_level || AccessLevel.PRIVATE,
        state: AgentState.NEW,
        kubernetes_namespace: 'agents',
        kubernetes_deployment: normalizedName,
        metadata: {
          description: description || template?.description,
          image: resolvedImage,
          container_port: template?.container_port || 3000,
          health_endpoint: template?.health_endpoint || '/health',
          resources,
          env_overrides,
          template_name: template ? `${template.namespace}/${template.name}` : undefined,
          template_version: template?.version,
        },
      })
      .returning();

    // Increment template install count
    if (template) {
      await db
        .update(agentTemplatesTable)
        .set({
          install_count: sql`${agentTemplatesTable.install_count} + 1`,
        })
        .where(eq(agentTemplatesTable.uuid, template.uuid));
    }

    // Log lifecycle event
    await db.insert(agentLifecycleEventsTable).values({
      agent_uuid: newAgent.uuid,
      event_type: 'CREATED',
      from_state: null,
      to_state: AgentState.NEW,
      metadata: {
        triggered_by: auth.project.user_id,
        profile_uuid: auth.activeProfile.uuid,
        template_uuid: template?.uuid,
        template_name: template ? `${template.namespace}/${template.name}` : undefined,
      },
    });

    // Build environment variables for the agent
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hub.plugged.in';

    // Get or create an API key for the agent to authenticate with PAP Station
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

    // Build environment variables using shared helper
    const agentEnv = buildAgentEnv({
      baseUrl,
      agentId: newAgent.uuid,
      normalizedName,
      dnsName,
      apiKey: agentApiKey,
      template,
      envOverrides: env_overrides,
    });

    // Deploy to Kubernetes
    const deploymentResult = await kubernetesService.deployAgent({
      name: normalizedName,
      dnsName,
      namespace: 'agents',
      image: resolvedImage,
      containerPort: template?.container_port || 3000,
      resources: resources ? {
        cpuRequest: resources.cpu_request,
        memoryRequest: resources.memory_request,
        cpuLimit: resources.cpu_limit,
        memoryLimit: resources.memory_limit,
      } : undefined,
      env: agentEnv,
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
          kubernetes_deployment: normalizedName,
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

    return NextResponse.json(serializeForJson({
      agent: newAgent,
      template: template ? {
        uuid: template.uuid,
        namespace: template.namespace,
        name: template.name,
        version: template.version,
        display_name: template.display_name,
      } : null,
      deployment: deploymentResult,
    }));
  } catch (error) {
    console.error('Error creating agent:', error);
    return NextResponse.json(
      { error: 'Failed to create agent' },
      { status: 500 }
    );
  }
}
