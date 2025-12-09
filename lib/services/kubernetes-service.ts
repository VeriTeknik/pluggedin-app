/**
 * Kubernetes Service for PAP Agent Management
 *
 * Handles deployment, monitoring, and lifecycle management of PAP agents
 * in the K3s cluster on is.plugged.in via direct Kubernetes API
 *
 * Uses Service Account token for authentication (no Rancher dependency)
 */

import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';

// Kubernetes API configuration (direct API with Service Account token)
const K8S_API_URL = process.env.K8S_API_URL || 'https://127.0.0.1:6443';
const K8S_SERVICE_ACCOUNT_TOKEN = process.env.K8S_SERVICE_ACCOUNT_TOKEN || '';

// TLS verification configuration
// By default, we verify certs using the in-cluster CA or K8S_CA_CERT
// Only set K8S_INSECURE_SKIP_TLS_VERIFY=true for local development
const K8S_INSECURE_SKIP_TLS_VERIFY = process.env.K8S_INSECURE_SKIP_TLS_VERIFY === 'true';

// Load CA certificate: prefer K8S_CA_CERT env var, then in-cluster CA file
const IN_CLUSTER_CA_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';
function loadK8sCaCert(): Buffer | undefined {
  // 1. Check for base64-encoded CA in environment
  if (process.env.K8S_CA_CERT) {
    return Buffer.from(process.env.K8S_CA_CERT, 'base64');
  }
  // 2. Check for in-cluster CA file (standard Kubernetes location)
  try {
    if (fs.existsSync(IN_CLUSTER_CA_PATH)) {
      return fs.readFileSync(IN_CLUSTER_CA_PATH);
    }
  } catch {
    // File doesn't exist or not readable - that's fine
  }
  return undefined;
}
const K8S_CA_CERT = loadK8sCaCert();

// Auth header for Kubernetes API
const k8sAuthHeader = K8S_SERVICE_ACCOUNT_TOKEN ? `Bearer ${K8S_SERVICE_ACCOUNT_TOKEN}` : '';

// Helper function to make HTTPS request with self-signed cert support
function httpsRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
): Promise<{ status: number; statusText: string; body: string }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';

    const requestOptions: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      // TLS verification: enabled by default, uses in-cluster CA or K8S_CA_CERT
      rejectUnauthorized: !K8S_INSECURE_SKIP_TLS_VERIFY,
      ...(K8S_CA_CERT && { ca: K8S_CA_CERT }),
    };

    const httpModule = isHttps ? https : http;

    const req = httpModule.request(requestOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          statusText: res.statusMessage || '',
          body,
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

// Helper function to make Kubernetes API requests (internal)
async function k8sRequest(
  path: string,
  options: { method?: string; body?: string; contentType?: string; rawResponse?: boolean } = {}
): Promise<unknown> {
  if (!K8S_SERVICE_ACCOUNT_TOKEN) {
    throw new Error('No Kubernetes authentication configured. Set K8S_SERVICE_ACCOUNT_TOKEN environment variable.');
  }

  const url = `${K8S_API_URL}${path}`;

  // Use strategic-merge-patch for PATCH operations by default
  let contentType = options.contentType || 'application/json';
  if (options.method === 'PATCH' && !options.contentType) {
    contentType = 'application/strategic-merge-patch+json';
  }

  const response = await httpsRequest(url, {
    method: options.method || 'GET',
    headers: {
      'Authorization': k8sAuthHeader,
      'Content-Type': contentType,
    },
    body: options.body,
  });

  if (response.status >= 400) {
    throw new Error(`Kubernetes API error: ${response.status} ${response.statusText} - ${response.body}`);
  }

  // Handle 204 No Content (for DELETE operations)
  if (response.status === 204 || !response.body) {
    return { success: true };
  }

  // Return raw response for logs endpoint (plain text)
  if (options.rawResponse) {
    return response.body;
  }

  return JSON.parse(response.body);
}

/**
 * Typed helper for JSON responses from Kubernetes API.
 */
async function k8sJson<T>(
  path: string,
  options: { method?: string; body?: object; contentType?: string } = {}
): Promise<T> {
  const result = await k8sRequest(path, {
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return result as T;
}

/**
 * Typed helper for text responses from Kubernetes API (e.g., logs).
 */
async function k8sText(path: string): Promise<string> {
  const result = await k8sRequest(path, { rawResponse: true });
  return result as string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Kubernetes API Response Types
// ─────────────────────────────────────────────────────────────────────────────

interface K8sDeploymentResponse {
  metadata: { name: string; namespace: string };
  spec?: {
    replicas?: number;
    template?: {
      metadata?: { annotations?: Record<string, string> };
    };
  };
  status?: {
    replicas?: number;
    readyReplicas?: number;
    availableReplicas?: number;
    updatedReplicas?: number;
    unavailableReplicas?: number;
    conditions?: Array<{
      type: string;
      status: string;
      reason?: string;
      message?: string;
    }>;
  };
}

interface K8sPodListResponse {
  items: Array<{
    metadata: { name: string };
    spec?: { nodeName?: string };
    status?: {
      phase?: string;
      podIP?: string;
      startTime?: string;
      containerStatuses?: Array<{
        name: string;
        ready: boolean;
        restartCount: number;
        state?: {
          running?: Record<string, unknown>;
          waiting?: { reason?: string; message?: string };
          terminated?: { reason?: string; message?: string };
        };
      }>;
    };
  }>;
}

interface K8sDeploymentListResponse {
  items: Array<{
    metadata: { name: string };
    status?: { replicas?: number; readyReplicas?: number };
  }>;
}

interface K8sEventListResponse {
  items: Array<{
    type?: string;
    reason?: string;
    message?: string;
    count?: number;
    firstTimestamp?: string;
    lastTimestamp?: string;
    eventTime?: string;
    source?: { component?: string; host?: string };
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Manifest Builder Functions
// ─────────────────────────────────────────────────────────────────────────────

interface ManifestConfig {
  name: string;
  namespace: string;
  dnsName: string;
  image: string;
  containerPort: number;
  resources: {
    cpuRequest: string;
    memoryRequest: string;
    cpuLimit: string;
    memoryLimit: string;
  };
  env?: Array<{ name: string; value: string }>;
}

function buildDeploymentManifest(config: ManifestConfig): object {
  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: config.name,
      namespace: config.namespace,
      labels: { app: config.name, 'pap-agent': 'true' },
    },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: config.name } },
      template: {
        metadata: { labels: { app: config.name, 'pap-agent': 'true' } },
        spec: {
          securityContext: {
            runAsNonRoot: true,
            runAsUser: 1001,
            fsGroup: 1001,
            seccompProfile: { type: 'RuntimeDefault' },
          },
          containers: [
            {
              name: 'agent',
              image: config.image,
              ports: [{ containerPort: config.containerPort, name: 'http' }],
              env: config.env?.length ? config.env : undefined,
              resources: {
                requests: { cpu: config.resources.cpuRequest, memory: config.resources.memoryRequest },
                limits: { cpu: config.resources.cpuLimit, memory: config.resources.memoryLimit },
              },
              securityContext: {
                allowPrivilegeEscalation: false,
                capabilities: { drop: ['ALL'] },
                readOnlyRootFilesystem: false,
              },
            },
          ],
        },
      },
    },
  };
}

function buildServiceManifest(config: ManifestConfig): object {
  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: config.name,
      namespace: config.namespace,
      labels: { app: config.name, 'pap-agent': 'true' },
    },
    spec: {
      selector: { app: config.name },
      ports: [{ port: 80, targetPort: config.containerPort, protocol: 'TCP', name: 'http' }],
      type: 'ClusterIP',
    },
  };
}

function buildIngressManifest(config: ManifestConfig): object {
  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name: config.name,
      namespace: config.namespace,
      labels: { app: config.name, 'pap-agent': 'true' },
      annotations: {
        'cert-manager.io/cluster-issuer': 'letsencrypt-prod',
        'traefik.ingress.kubernetes.io/router.entrypoints': 'web,websecure',
        'traefik.ingress.kubernetes.io/router.tls': 'true',
      },
    },
    spec: {
      ingressClassName: 'traefik',
      tls: [{ hosts: [config.dnsName], secretName: `${config.name}-tls` }],
      rules: [
        {
          host: config.dnsName,
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: { service: { name: config.name, port: { number: 80 } } },
              },
            ],
          },
        },
      ],
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentDeploymentConfig {
  name: string; // DNS-safe agent name (e.g., 'focus', 'memory')
  dnsName: string; // Full DNS: {name}.{cluster}.a.plugged.in
  namespace?: string; // Kubernetes namespace (default: 'agents')
  image?: string; // Container image (default: nginx-unprivileged for testing)
  containerPort?: number; // Container port (default: 8080)
  resources?: {
    cpuRequest?: string; // e.g., '100m'
    memoryRequest?: string; // e.g., '256Mi'
    cpuLimit?: string; // e.g., '1000m'
    memoryLimit?: string; // e.g., '1Gi'
  };
  env?: Record<string, string>; // Environment variables to inject
}

export interface DeploymentStatus {
  ready: boolean;
  replicas: number;
  readyReplicas: number;
  availableReplicas: number;
  updatedReplicas: number;
  unavailableReplicas?: number;
  conditions?: Array<{
    type: string;
    status: string;
    reason?: string;
    message?: string;
  }>;
}

export class KubernetesService {
  private readonly defaultNamespace = 'agents';
  private readonly defaultImage = 'nginxinc/nginx-unprivileged:alpine';

  /**
   * Deploy a new PAP agent to Kubernetes via Kubernetes API.
   * Creates Deployment, Service, and Ingress resources.
   */
  async deployAgent(config: AgentDeploymentConfig): Promise<{ success: boolean; message: string; deploymentName: string }> {
    try {
      const namespace = config.namespace || this.defaultNamespace;

      // Build manifest configuration
      const manifestConfig: ManifestConfig = {
        name: config.name,
        namespace,
        dnsName: config.dnsName,
        image: config.image || this.defaultImage,
        containerPort: config.containerPort || 8080,
        resources: {
          cpuRequest: config.resources?.cpuRequest || '100m',
          memoryRequest: config.resources?.memoryRequest || '256Mi',
          cpuLimit: config.resources?.cpuLimit || '1000m',
          memoryLimit: config.resources?.memoryLimit || '1Gi',
        },
        env: config.env
          ? Object.entries(config.env).map(([name, value]) => ({ name, value: String(value) }))
          : undefined,
      };

      // Create Deployment using manifest builder
      await k8sJson(`/apis/apps/v1/namespaces/${namespace}/deployments`, {
        method: 'POST',
        body: buildDeploymentManifest(manifestConfig),
      });

      // Create Service using manifest builder
      await k8sJson(`/api/v1/namespaces/${namespace}/services`, {
        method: 'POST',
        body: buildServiceManifest(manifestConfig),
      });

      // Create Ingress using manifest builder
      await k8sJson(`/apis/networking.k8s.io/v1/namespaces/${namespace}/ingresses`, {
        method: 'POST',
        body: buildIngressManifest(manifestConfig),
      });

      return {
        success: true,
        message: `Agent ${config.name} deployed successfully`,
        deploymentName: config.name,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: `Failed to deploy agent: ${errorMessage}`,
        deploymentName: config.name,
      };
    }
  }

  /**
   * Get deployment status for an agent via Kubernetes API.
   */
  async getDeploymentStatus(name: string, namespace?: string): Promise<DeploymentStatus | null> {
    try {
      const ns = namespace || this.defaultNamespace;

      const deployment = await k8sJson<K8sDeploymentResponse>(
        `/apis/apps/v1/namespaces/${ns}/deployments/${name}`
      );

      const status = deployment.status || {};

      return {
        ready: (status.readyReplicas || 0) === (status.replicas || 0),
        replicas: status.replicas || 0,
        readyReplicas: status.readyReplicas || 0,
        availableReplicas: status.availableReplicas || 0,
        updatedReplicas: status.updatedReplicas || 0,
        unavailableReplicas: status.unavailableReplicas,
        conditions: status.conditions || [],
      };
    } catch {
      // Deployment doesn't exist or error occurred
      return null;
    }
  }

  /**
   * Check if an agent deployment exists via Kubernetes API.
   */
  async deploymentExists(name: string, namespace?: string): Promise<boolean> {
    try {
      const ns = namespace || this.defaultNamespace;
      await k8sJson<K8sDeploymentResponse>(`/apis/apps/v1/namespaces/${ns}/deployments/${name}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete an agent deployment and all related resources via Kubernetes API.
   */
  async deleteAgent(name: string, namespace?: string): Promise<{ success: boolean; message: string }> {
    try {
      const ns = namespace || this.defaultNamespace;

      // Delete deployment
      try {
        await k8sJson(`/apis/apps/v1/namespaces/${ns}/deployments/${name}`, { method: 'DELETE' });
      } catch (error) {
        console.warn(`Warning: Could not delete deployment ${name}:`, error);
      }

      // Delete service
      try {
        await k8sJson(`/api/v1/namespaces/${ns}/services/${name}`, { method: 'DELETE' });
      } catch (error) {
        console.warn(`Warning: Could not delete service ${name}:`, error);
      }

      // Delete ingress
      try {
        await k8sJson(`/apis/networking.k8s.io/v1/namespaces/${ns}/ingresses/${name}`, { method: 'DELETE' });
      } catch (error) {
        console.warn(`Warning: Could not delete ingress ${name}:`, error);
      }

      // Delete TLS secret
      try {
        await k8sJson(`/api/v1/namespaces/${ns}/secrets/${name}-tls`, { method: 'DELETE' });
      } catch (error) {
        console.warn(`Warning: Could not delete TLS secret for ${name}:`, error);
      }

      return {
        success: true,
        message: `Agent ${name} deleted successfully`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: `Failed to delete agent: ${errorMessage}`,
      };
    }
  }

  /**
   * List all PAP agent deployments via Kubernetes API.
   */
  async listAgents(namespace?: string): Promise<Array<{ name: string; ready: boolean }>> {
    try {
      const ns = namespace || this.defaultNamespace;
      const result = await k8sJson<K8sDeploymentListResponse>(
        `/apis/apps/v1/namespaces/${ns}/deployments?labelSelector=pap-agent=true`
      );

      return (result.items || []).map((deployment) => ({
        name: deployment.metadata.name,
        ready: (deployment.status?.readyReplicas || 0) === (deployment.status?.replicas || 0),
      }));
    } catch (error) {
      console.error('Error listing agents:', error);
      return [];
    }
  }

  /**
   * Scale an agent deployment.
   */
  async scaleAgent(name: string, replicas: number, namespace?: string): Promise<{ success: boolean; message: string }> {
    try {
      const ns = namespace || this.defaultNamespace;

      await k8sJson(`/apis/apps/v1/namespaces/${ns}/deployments/${name}/scale`, {
        method: 'PATCH',
        body: { spec: { replicas } },
      });

      return {
        success: true,
        message: `Agent ${name} scaled to ${replicas} replicas`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: `Failed to scale agent: ${errorMessage}`,
      };
    }
  }

  /**
   * Restart a deployment using the Kubernetes rollout restart mechanism.
   * Adds a restart annotation which triggers a rolling restart.
   */
  async restartDeployment(name: string, namespace?: string): Promise<{ success: boolean; message: string }> {
    try {
      const ns = namespace || this.defaultNamespace;

      // Get current deployment
      const deployment = await k8sJson<K8sDeploymentResponse>(
        `/apis/apps/v1/namespaces/${ns}/deployments/${name}`
      );

      // Add restart annotation (Kubernetes way to trigger rolling restart)
      const now = new Date().toISOString();
      const annotations = deployment.spec?.template?.metadata?.annotations || {};
      annotations['kubectl.kubernetes.io/restartedAt'] = now;

      // Patch the deployment with the restart annotation
      await k8sJson(`/apis/apps/v1/namespaces/${ns}/deployments/${name}`, {
        method: 'PATCH',
        body: { spec: { template: { metadata: { annotations } } } },
      });

      return {
        success: true,
        message: `Deployment ${name} restart initiated at ${now}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: `Failed to restart deployment: ${errorMessage}`,
      };
    }
  }

  /**
   * Get logs from an agent pod via Kubernetes API.
   */
  async getAgentLogs(name: string, namespace?: string, tailLines: number = 100): Promise<string | null> {
    try {
      const ns = namespace || this.defaultNamespace;

      // First get pods for this deployment
      const pods = await k8sJson<K8sPodListResponse>(
        `/api/v1/namespaces/${ns}/pods?labelSelector=app=${name}`
      );

      if (!pods.items || pods.items.length === 0) {
        console.warn(`No pods found for deployment ${name}`);
        return null;
      }

      // Find a running pod (prefer running pods)
      const runningPod = pods.items.find((pod) => pod.status?.phase === 'Running');
      const targetPod = runningPod || pods.items[0];
      const podName = targetPod.metadata?.name;

      if (!podName) {
        console.warn(`Could not determine pod name for deployment ${name}`);
        return null;
      }

      // Get logs from the pod (returns plain text)
      try {
        return await k8sText(
          `/api/v1/namespaces/${ns}/pods/${podName}/log?tailLines=${tailLines}&timestamps=true`
        );
      } catch (logError) {
        // Handle case where container is waiting to start (ImagePullBackOff, etc.)
        const errorMsg = logError instanceof Error ? logError.message : '';
        if (errorMsg.includes('waiting to start') || errorMsg.includes('400 Bad Request')) {
          console.warn(`Container not ready for logs: ${podName}`);
          return null;
        }
        throw logError;
      }
    } catch (error) {
      console.error('Error getting agent logs:', error);
      return null;
    }
  }

  /**
   * Get pod events for an agent deployment.
   */
  async getAgentEvents(name: string, namespace?: string): Promise<Array<{
    type: string;
    reason: string;
    message: string;
    count: number;
    firstTimestamp: string;
    lastTimestamp: string;
    source: string;
  }>> {
    try {
      const ns = namespace || this.defaultNamespace;

      // Get pods for this deployment
      const pods = await k8sJson<K8sPodListResponse>(
        `/api/v1/namespaces/${ns}/pods?labelSelector=app=${name}`
      );

      const podNames = pods.items?.map((pod) => pod.metadata.name) || [];
      const allEvents: K8sEventListResponse['items'] = [];

      // Get events for deployment
      const deploymentEvents = await k8sJson<K8sEventListResponse>(
        `/api/v1/namespaces/${ns}/events?fieldSelector=involvedObject.name=${name},involvedObject.kind=Deployment`
      );
      allEvents.push(...(deploymentEvents.items || []));

      // Get events for each pod
      for (const podName of podNames) {
        try {
          const podEvents = await k8sJson<K8sEventListResponse>(
            `/api/v1/namespaces/${ns}/events?fieldSelector=involvedObject.name=${podName},involvedObject.kind=Pod`
          );
          allEvents.push(...(podEvents.items || []));
        } catch (error) {
          // Pod might have been deleted
          console.warn(`Could not get events for pod ${podName}:`, error);
        }
      }

      // Sort by lastTimestamp descending
      allEvents.sort((a, b) => {
        const timeA = new Date(a.lastTimestamp || a.eventTime || 0).getTime();
        const timeB = new Date(b.lastTimestamp || b.eventTime || 0).getTime();
        return timeB - timeA;
      });

      return allEvents.map((event) => ({
        type: event.type || 'Normal',
        reason: event.reason || 'Unknown',
        message: event.message || '',
        count: event.count || 1,
        firstTimestamp: event.firstTimestamp || event.eventTime || '',
        lastTimestamp: event.lastTimestamp || event.eventTime || '',
        source: `${event.source?.component || ''}${event.source?.host ? ` on ${event.source.host}` : ''}`,
      }));
    } catch (error) {
      console.error('Error getting agent events:', error);
      return [];
    }
  }

  /**
   * Get pod status details for an agent.
   */
  async getAgentPodStatus(name: string, namespace?: string): Promise<Array<{
    name: string;
    phase: string;
    ready: boolean;
    restarts: number;
    containerStatuses: Array<{
      name: string;
      ready: boolean;
      state: string;
      stateReason?: string;
      stateMessage?: string;
      restartCount: number;
    }>;
    startTime?: string;
    podIP?: string;
    nodeName?: string;
  }>> {
    try {
      const ns = namespace || this.defaultNamespace;

      const pods = await k8sJson<K8sPodListResponse>(
        `/api/v1/namespaces/${ns}/pods?labelSelector=app=${name}`
      );

      return (pods.items || []).map((pod) => {
        const containerStatuses = (pod.status?.containerStatuses || []).map((cs) => {
          let state = 'Unknown';
          let stateReason: string | undefined;
          let stateMessage: string | undefined;

          if (cs.state?.running) {
            state = 'Running';
          } else if (cs.state?.waiting) {
            state = 'Waiting';
            stateReason = cs.state.waiting.reason;
            stateMessage = cs.state.waiting.message;
          } else if (cs.state?.terminated) {
            state = 'Terminated';
            stateReason = cs.state.terminated.reason;
            stateMessage = cs.state.terminated.message;
          }

          return {
            name: cs.name,
            ready: cs.ready || false,
            state,
            stateReason,
            stateMessage,
            restartCount: cs.restartCount || 0,
          };
        });

        return {
          name: pod.metadata?.name || 'unknown',
          phase: pod.status?.phase || 'Unknown',
          ready: containerStatuses.every((cs) => cs.ready),
          restarts: containerStatuses.reduce((sum, cs) => sum + cs.restartCount, 0),
          containerStatuses,
          startTime: pod.status?.startTime,
          podIP: pod.status?.podIP,
          nodeName: pod.spec?.nodeName,
        };
      });
    } catch (error) {
      console.error('Error getting agent pod status:', error);
      return [];
    }
  }

  /**
   * Upgrade an agent with new image and/or resources using rolling update via Kubernetes API.
   */
  async upgradeAgent(config: {
    name: string;
    namespace?: string;
    image: string;
    resources?: {
      cpu_request?: string;
      cpu_limit?: string;
      memory_request?: string;
      memory_limit?: string;
    };
    strategy?: {
      type: 'RollingUpdate' | 'Recreate';
      rollingUpdate?: {
        maxSurge?: number;
        maxUnavailable?: number;
      };
    };
  }): Promise<{ success: boolean; message: string }> {
    try {
      const ns = config.namespace || this.defaultNamespace;

      // Build the patch object
      const patch: Record<string, unknown> = {
        spec: {
          template: {
            spec: {
              containers: [{ name: 'agent', image: config.image }],
            },
          },
        },
      };

      // Add resources if provided
      if (config.resources) {
        const resources: { requests?: Record<string, string>; limits?: Record<string, string> } = {};
        if (config.resources.cpu_request || config.resources.memory_request) {
          resources.requests = {};
          if (config.resources.cpu_request) resources.requests.cpu = config.resources.cpu_request;
          if (config.resources.memory_request) resources.requests.memory = config.resources.memory_request;
        }
        if (config.resources.cpu_limit || config.resources.memory_limit) {
          resources.limits = {};
          if (config.resources.cpu_limit) resources.limits.cpu = config.resources.cpu_limit;
          if (config.resources.memory_limit) resources.limits.memory = config.resources.memory_limit;
        }
        if (Object.keys(resources).length > 0) {
          ((patch.spec as Record<string, unknown>).template as Record<string, unknown>).spec = {
            containers: [{ name: 'agent', image: config.image, resources }],
          };
        }
      }

      // Add strategy if provided
      if (config.strategy?.type === 'RollingUpdate' && config.strategy.rollingUpdate) {
        const { maxSurge, maxUnavailable } = config.strategy.rollingUpdate;
        (patch.spec as Record<string, unknown>).strategy = {
          type: 'RollingUpdate',
          rollingUpdate: {
            ...(maxSurge !== undefined && { maxSurge }),
            ...(maxUnavailable !== undefined && { maxUnavailable }),
          },
        };
      }

      // Apply the patch
      await k8sJson(`/apis/apps/v1/namespaces/${ns}/deployments/${config.name}`, {
        method: 'PATCH',
        body: patch,
      });

      // Note: We can't easily wait for rollout via API like kubectl does
      // The caller should poll getDeploymentStatus to check progress
      return {
        success: true,
        message: `Agent ${config.name} upgrade initiated to ${config.image}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: `Upgrade failed: ${errorMessage}`,
      };
    }
  }
}

// Export singleton instance
export const kubernetesService = new KubernetesService();
