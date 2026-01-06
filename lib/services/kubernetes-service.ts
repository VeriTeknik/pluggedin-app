/**
 * Kubernetes Service for PAP Agent Management
 *
 * Handles deployment, monitoring, and lifecycle management of PAP agents
 * in the K3s cluster on is.plugged.in via direct Kubernetes API
 *
 * Uses Service Account token for authentication (no Rancher dependency)
 */

import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';

// Kubernetes API configuration (direct API with Service Account token)
const K8S_API_URL = process.env.K8S_API_URL || 'https://127.0.0.1:6443';
const K8S_SERVICE_ACCOUNT_TOKEN = process.env.K8S_SERVICE_ACCOUNT_TOKEN || '';

// TLS Server Name override (for when K8S_API_URL hostname doesn't match cert SANs)
// Example: If connecting via k8s.is.plugged.in but cert only has 'is.plugged.in',
// set K8S_TLS_SERVER_NAME=is.plugged.in to use that for TLS verification
const K8S_TLS_SERVER_NAME = process.env.K8S_TLS_SERVER_NAME || '';

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

// Default namespace for PAP agents
const DEFAULT_AGENT_NAMESPACE = process.env.K8S_AGENT_NAMESPACE || 'agents';

// Allowed namespaces for PAP agents (comma-separated env var or default)
const ALLOWED_AGENT_NAMESPACES = new Set(
  (process.env.K8S_ALLOWED_NAMESPACES || 'agents,agents-dev,agents-staging')
    .split(',')
    .map((ns) => ns.trim())
    .filter(Boolean)
);

/**
 * Validate namespace against allowlist.
 * Returns error message if invalid, null if valid.
 */
export function validateNamespace(namespace: string): string | null {
  if (!namespace || namespace.trim() === '') {
    return 'Namespace cannot be empty';
  }
  if (!ALLOWED_AGENT_NAMESPACES.has(namespace)) {
    return `Namespace '${namespace}' is not allowed. Allowed namespaces: ${Array.from(ALLOWED_AGENT_NAMESPACES).join(', ')}`;
  }
  return null;
}

/**
 * Encode a value for use in a Kubernetes API URL path segment.
 * SECURITY: Prevents path traversal and injection by properly encoding special characters.
 */
function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

// Request timeout (configurable via env var, default 30 seconds)
const K8S_REQUEST_TIMEOUT_MS = parseInt(process.env.K8S_REQUEST_TIMEOUT_MS || '30000', 10);

// Overall deployment timeout (default 60 seconds for complete Deployment+Service+Ingress)
const K8S_DEPLOY_TIMEOUT_MS = parseInt(process.env.K8S_DEPLOY_TIMEOUT_MS || '60000', 10);

/**
 * Wrap a promise with a timeout.
 * SECURITY: Prevents resource-intensive operations from hanging indefinitely.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)),
        timeoutMs
      )
    ),
  ]);
}

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
    // SECURITY: Runtime TLS validation for production environments
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      if (K8S_INSECURE_SKIP_TLS_VERIFY) {
        return reject(new Error(
          'K8S_INSECURE_SKIP_TLS_VERIFY cannot be enabled in production. ' +
          'Set K8S_CA_CERT with your cluster CA certificate instead.'
        ));
      }
      if (!K8S_CA_CERT) {
        return reject(new Error(
          'K8S_CA_CERT must be configured in production for secure Kubernetes API communication.'
        ));
      }
    }

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
      // Server name override for TLS (when URL hostname doesn't match cert SANs)
      // This tells Node to verify cert against K8S_TLS_SERVER_NAME instead of URL hostname
      ...(K8S_TLS_SERVER_NAME && {
        servername: K8S_TLS_SERVER_NAME,
        checkServerIdentity: (_host: string, cert: { subject: { CN?: string } }) => {
          // Use tls.checkServerIdentity with overridden hostname
          const tls = require('tls');
          return tls.checkServerIdentity(K8S_TLS_SERVER_NAME, cert);
        },
      }),
    };

    const httpModule = isHttps ? https : http;

    // Track if promise has been settled to prevent double rejection
    let settled = false;

    const req = httpModule.request(requestOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (settled) return;
        settled = true;
        resolve({
          status: res.statusCode || 0,
          statusText: res.statusMessage || '',
          body,
        });
      });
    });

    // Set request timeout - set settled before destroy to prevent race condition
    req.setTimeout(K8S_REQUEST_TIMEOUT_MS, () => {
      if (settled) return;
      settled = true;
      const timeoutError = new Error(`Kubernetes API request timed out after ${K8S_REQUEST_TIMEOUT_MS}ms`);
      req.destroy(timeoutError);
      reject(timeoutError);
    });

    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

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
    const isDevelopment = process.env.NODE_ENV === 'development';

    // Extract only safe error information from K8s response
    // K8s API returns structured errors with message, reason, code fields
    let safeErrorInfo = '';
    const logMessage = `Kubernetes API error: ${response.status} ${response.statusText}`;

    try {
      const errorBody = JSON.parse(response.body);
      // Only extract standard K8s error fields, avoid exposing internal details
      const safeFields: { reason?: string; code?: number; kind?: string; message?: string } = {
        reason: errorBody.reason,  // e.g., "NotFound", "AlreadyExists"
        code: errorBody.code,      // HTTP status code
        kind: errorBody.kind,      // Usually "Status"
      };

      // SECURITY: Redact resource names from message in production
      // K8s messages often contain pod/service/namespace names
      if (isDevelopment) {
        safeFields.message = errorBody.message;
        safeErrorInfo = JSON.stringify(safeFields);
      } else {
        // In production, only include the reason (not the full message with resource names)
        safeErrorInfo = `reason=${safeFields.reason}, code=${safeFields.code}`;
      }
    } catch {
      // Not JSON or parse failed - log nothing from body
      safeErrorInfo = '(non-JSON response)';
    }

    // SECURITY: Log error with appropriate detail level
    // Development: include K8s error details for debugging
    // Production: minimal logging to avoid leaking cluster topology
    if (isDevelopment) {
      console.error(`[K8s] ${logMessage} - ${safeErrorInfo}`);
    } else {
      // Production: only log HTTP status, no K8s-specific details
      console.error(`[K8s] API error: ${response.status}`);
    }

    // Return sanitized error (never includes internal details)
    throw new Error(`Kubernetes API error: ${response.status} ${response.statusText}`);
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
  private readonly defaultNamespace = DEFAULT_AGENT_NAMESPACE;
  private readonly defaultImage = 'ghcr.io/veriteknik/compass-agent:latest';

  /**
   * Deploy a new PAP agent to Kubernetes via Kubernetes API.
   * Creates Deployment, Service, and Ingress resources.
   * SECURITY: Wrapped with overall operation timeout to prevent hanging.
   */
  async deployAgent(config: AgentDeploymentConfig): Promise<{ success: boolean; message: string; deploymentName: string }> {
    try {
      // Wrap entire deployment with timeout
      return await withTimeout(
        this._deployAgentInternal(config),
        K8S_DEPLOY_TIMEOUT_MS,
        `Agent deployment (${config.name})`
      );
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
   * Internal deployment logic (called with timeout wrapper).
   */
  private async _deployAgentInternal(config: AgentDeploymentConfig): Promise<{ success: boolean; message: string; deploymentName: string }> {
    const namespace = config.namespace || this.defaultNamespace;

    // SECURITY: Validate namespace against allowlist (defense in depth)
    const namespaceError = validateNamespace(namespace);
    if (namespaceError) {
      return {
        success: false,
        message: namespaceError,
        deploymentName: config.name,
      };
    }

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

    // SECURITY: Encode namespace for URL path
    const encodedNamespace = encodePathSegment(namespace);

    // Create Deployment first (required for Service/Ingress to work)
    await k8sJson(`/apis/apps/v1/namespaces/${encodedNamespace}/deployments`, {
      method: 'POST',
      body: buildDeploymentManifest(manifestConfig),
    });

    // Create Service and Ingress in parallel (both depend on Deployment)
    try {
      await Promise.all([
        k8sJson(`/api/v1/namespaces/${encodedNamespace}/services`, {
          method: 'POST',
          body: buildServiceManifest(manifestConfig),
        }),
        k8sJson(`/apis/networking.k8s.io/v1/namespaces/${encodedNamespace}/ingresses`, {
          method: 'POST',
          body: buildIngressManifest(manifestConfig),
        }),
      ]);
    } catch (error) {
      // Rollback deployment on Service/Ingress failure
      console.error(`Failed to create Service/Ingress for ${config.name}, rolling back deployment:`, error);
      await this.deleteAgent(config.name, namespace);
      throw error;
    }

    return {
      success: true,
      message: `Agent ${config.name} deployed successfully`,
      deploymentName: config.name,
    };
  }

  /**
   * Get deployment status for an agent via Kubernetes API.
   */
  async getDeploymentStatus(name: string, namespace?: string): Promise<DeploymentStatus | null> {
    try {
      const ns = namespace || this.defaultNamespace;
      // SECURITY: Encode path segments
      const encodedNs = encodePathSegment(ns);
      const encodedName = encodePathSegment(name);

      const deployment = await k8sJson<K8sDeploymentResponse>(
        `/apis/apps/v1/namespaces/${encodedNs}/deployments/${encodedName}`
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
      // SECURITY: Encode path segments
      const encodedNs = encodePathSegment(ns);
      const encodedName = encodePathSegment(name);
      await k8sJson<K8sDeploymentResponse>(`/apis/apps/v1/namespaces/${encodedNs}/deployments/${encodedName}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete an agent deployment and all related resources via Kubernetes API.
   */
  async deleteAgent(name: string, namespace?: string): Promise<{
    success: boolean;
    message: string;
    deletedResources?: string[];
    skippedResources?: string[];
    failedResources?: string[];
  }> {
    const ns = namespace || this.defaultNamespace;

    // SECURITY: Validate namespace against allowlist
    const namespaceError = validateNamespace(ns);
    if (namespaceError) {
      return {
        success: false,
        message: namespaceError,
      };
    }

    const deleted: string[] = [];
    const skipped: string[] = []; // Resources that didn't exist (404) - that's fine
    const failed: string[] = [];

    // SECURITY: Encode path segments
    const encodedNs = encodePathSegment(ns);
    const encodedName = encodePathSegment(name);

    // Unified resource list - covers both single-container and multi-container templates
    // Delete in reverse order of creation (networking first, then compute, then storage)
    const resources = [
      // Traefik CRDs (OpenCode templates)
      { type: 'ingressroute', path: `/apis/traefik.io/v1alpha1/namespaces/${encodedNs}/ingressroutes/${encodedName}` },
      { type: 'middleware-opencode', path: `/apis/traefik.io/v1alpha1/namespaces/${encodedNs}/middlewares/${encodePathSegment(`${name}-strip-opencode`)}` },
      { type: 'middleware-terminal', path: `/apis/traefik.io/v1alpha1/namespaces/${encodedNs}/middlewares/${encodePathSegment(`${name}-strip-terminal`)}` },
      // Standard Kubernetes networking
      { type: 'ingress', path: `/apis/networking.k8s.io/v1/namespaces/${encodedNs}/ingresses/${encodedName}` },
      { type: 'service', path: `/api/v1/namespaces/${encodedNs}/services/${encodedName}` },
      // Compute
      { type: 'deployment', path: `/apis/apps/v1/namespaces/${encodedNs}/deployments/${encodedName}` },
      // Config and secrets
      { type: 'configmap', path: `/api/v1/namespaces/${encodedNs}/configmaps/${encodePathSegment(`${name}-config`)}` },
      { type: 'secret', path: `/api/v1/namespaces/${encodedNs}/secrets/${encodePathSegment(`${name}-secrets`)}` },
      { type: 'tls-secret', path: `/api/v1/namespaces/${encodedNs}/secrets/${encodePathSegment(`${name}-tls`)}` },
      // Storage (OpenCode templates)
      { type: 'pvc', path: `/api/v1/namespaces/${encodedNs}/persistentvolumeclaims/${encodePathSegment(`${name}-workspace`)}` },
    ];

    for (const resource of resources) {
      try {
        await k8sJson(resource.path, { method: 'DELETE' });
        deleted.push(resource.type);
      } catch (error) {
        // 404 means resource doesn't exist - that's fine, skip it
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
          skipped.push(resource.type);
        } else {
          console.warn(`Warning: Could not delete ${resource.type} for ${name}:`, error);
          failed.push(resource.type);
        }
      }
    }

    const success = failed.length === 0;
    return {
      success,
      message: success
        ? `Agent ${name} deleted successfully (${deleted.length} resources deleted, ${skipped.length} skipped)`
        : `Agent ${name} partially deleted. Failed: ${failed.join(', ')}`,
      deletedResources: deleted.length > 0 ? deleted : undefined,
      skippedResources: skipped.length > 0 ? skipped : undefined,
      failedResources: failed.length > 0 ? failed : undefined,
    };
  }

  /**
   * List all PAP agent deployments via Kubernetes API.
   */
  async listAgents(namespace?: string): Promise<Array<{ name: string; ready: boolean }>> {
    try {
      const ns = namespace || this.defaultNamespace;
      // SECURITY: Encode namespace for URL path
      const encodedNs = encodePathSegment(ns);
      const result = await k8sJson<K8sDeploymentListResponse>(
        `/apis/apps/v1/namespaces/${encodedNs}/deployments?labelSelector=pap-agent=true`
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

      // SECURITY: Validate namespace against allowlist
      const namespaceError = validateNamespace(ns);
      if (namespaceError) {
        return { success: false, message: namespaceError };
      }

      // SECURITY: Encode path segments
      const encodedNs = encodePathSegment(ns);
      const encodedName = encodePathSegment(name);

      await k8sJson(`/apis/apps/v1/namespaces/${encodedNs}/deployments/${encodedName}/scale`, {
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

      // SECURITY: Validate namespace against allowlist
      const namespaceError = validateNamespace(ns);
      if (namespaceError) {
        return { success: false, message: namespaceError };
      }

      // SECURITY: Encode path segments
      const encodedNs = encodePathSegment(ns);
      const encodedName = encodePathSegment(name);

      // Get current deployment
      const deployment = await k8sJson<K8sDeploymentResponse>(
        `/apis/apps/v1/namespaces/${encodedNs}/deployments/${encodedName}`
      );

      // Add restart annotation (Kubernetes way to trigger rolling restart)
      const now = new Date().toISOString();
      const annotations = deployment.spec?.template?.metadata?.annotations || {};
      annotations['kubectl.kubernetes.io/restartedAt'] = now;

      // Patch the deployment with the restart annotation
      await k8sJson(`/apis/apps/v1/namespaces/${encodedNs}/deployments/${encodedName}`, {
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
      // SECURITY: Encode path segments and query parameters
      const encodedNs = encodePathSegment(ns);
      const encodedLabelSelector = encodeURIComponent(`app=${name}`);

      // First get pods for this deployment
      const pods = await k8sJson<K8sPodListResponse>(
        `/api/v1/namespaces/${encodedNs}/pods?labelSelector=${encodedLabelSelector}`
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

      // SECURITY: Encode pod name for URL path
      const encodedPodName = encodePathSegment(podName);

      // Get logs from the pod (returns plain text)
      try {
        return await k8sText(
          `/api/v1/namespaces/${encodedNs}/pods/${encodedPodName}/log?tailLines=${tailLines}&timestamps=true`
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
      // SECURITY: Encode path segments and query parameters
      const encodedNs = encodePathSegment(ns);
      const encodedLabelSelector = encodeURIComponent(`app=${name}`);

      // Get pods for this deployment
      const pods = await k8sJson<K8sPodListResponse>(
        `/api/v1/namespaces/${encodedNs}/pods?labelSelector=${encodedLabelSelector}`
      );

      const podNames = pods.items?.map((pod) => pod.metadata.name) || [];
      const allEvents: K8sEventListResponse['items'] = [];

      // Get events for deployment
      const encodedDeploymentFieldSelector = encodeURIComponent(`involvedObject.name=${name},involvedObject.kind=Deployment`);
      const deploymentEvents = await k8sJson<K8sEventListResponse>(
        `/api/v1/namespaces/${encodedNs}/events?fieldSelector=${encodedDeploymentFieldSelector}`
      );
      allEvents.push(...(deploymentEvents.items || []));

      // Get events for each pod in parallel
      const podEventResults = await Promise.allSettled(
        podNames.map((podName) => {
          const encodedPodFieldSelector = encodeURIComponent(`involvedObject.name=${podName},involvedObject.kind=Pod`);
          return k8sJson<K8sEventListResponse>(
            `/api/v1/namespaces/${encodedNs}/events?fieldSelector=${encodedPodFieldSelector}`
          );
        })
      );

      for (let i = 0; i < podEventResults.length; i++) {
        const result = podEventResults[i];
        if (result.status === 'fulfilled') {
          allEvents.push(...(result.value.items || []));
        } else {
          // Pod might have been deleted
          console.warn(`Could not get events for pod ${podNames[i]}:`, result.reason);
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
      // SECURITY: Encode path segments and query parameters
      const encodedNs = encodePathSegment(ns);
      const encodedLabelSelector = encodeURIComponent(`app=${name}`);

      const pods = await k8sJson<K8sPodListResponse>(
        `/api/v1/namespaces/${encodedNs}/pods?labelSelector=${encodedLabelSelector}`
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

      // SECURITY: Encode path segments
      const encodedNs = encodePathSegment(ns);
      const encodedName = encodePathSegment(config.name);

      // Apply the patch
      await k8sJson(`/apis/apps/v1/namespaces/${encodedNs}/deployments/${encodedName}`, {
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Multi-Container OpenCode Template Support
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Deploy an OpenCode agent with multi-container support.
   * Handles PVC, Secret, ConfigMap, Deployment, Service, and Ingress creation.
   */
  async deployOpenCodeAgent(config: {
    name: string;
    namespace?: string;
    dnsName: string;
    templateType: 'opencode-ide' | 'opencode-chamber';
    agentUuid: string;
    uiPassword: string;
    defaultModel: string;
    modelRouterUrl: string; // Region-specific Model Router URL
    modelRouterToken: string;
    papApiKey: string;
    pluggedinApiKey: string;
    workspaceStorageSize?: string;
  }): Promise<{ success: boolean; message: string; deploymentName: string }> {
    try {
      return await withTimeout(
        this._deployOpenCodeAgentInternal(config),
        K8S_DEPLOY_TIMEOUT_MS * 2, // Double timeout for multi-container
        `OpenCode agent deployment (${config.name})`
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: `Failed to deploy OpenCode agent: ${errorMessage}`,
        deploymentName: config.name,
      };
    }
  }

  /**
   * Internal OpenCode deployment logic.
   */
  private async _deployOpenCodeAgentInternal(config: {
    name: string;
    namespace?: string;
    dnsName: string;
    templateType: 'opencode-ide' | 'opencode-chamber';
    agentUuid: string;
    uiPassword: string;
    defaultModel: string;
    modelRouterUrl: string; // Region-specific Model Router URL
    modelRouterToken: string;
    papApiKey: string;
    pluggedinApiKey: string;
    workspaceStorageSize?: string;
  }): Promise<{ success: boolean; message: string; deploymentName: string }> {
    const namespace = config.namespace || this.defaultNamespace;

    // Validate namespace
    const namespaceError = validateNamespace(namespace);
    if (namespaceError) {
      return { success: false, message: namespaceError, deploymentName: config.name };
    }

    // Import manifest builder dynamically to avoid circular deps
    const { buildOpenCodeManifests } = await import('../agents/opencode-manifests');

    // Build manifests
    const manifests = buildOpenCodeManifests({
      name: config.name,
      namespace,
      dnsName: config.dnsName,
      templateType: config.templateType,
      secretName: `${config.name}-secrets`,
      configMapName: `${config.name}-config`,
      uiPassword: config.uiPassword,
      defaultModel: config.defaultModel,
      agentUuid: config.agentUuid,
      modelRouterUrl: config.modelRouterUrl,
      modelRouterToken: config.modelRouterToken,
      papApiKey: config.papApiKey,
      pluggedinApiKey: config.pluggedinApiKey,
      workspaceStorageSize: config.workspaceStorageSize,
    });

    const encodedNs = encodePathSegment(namespace);

    // Step 1: Create PVC (must exist before deployment)
    try {
      await k8sJson(`/api/v1/namespaces/${encodedNs}/persistentvolumeclaims`, {
        method: 'POST',
        body: manifests.pvc,
      });
    } catch (error) {
      // PVC might already exist, continue
      const errMsg = error instanceof Error ? error.message : '';
      if (!errMsg.includes('409')) {
        console.warn(`Warning: PVC creation issue: ${errMsg}`);
      }
    }

    // Step 2: Create Secret
    try {
      await k8sJson(`/api/v1/namespaces/${encodedNs}/secrets`, {
        method: 'POST',
        body: manifests.secret,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : '';
      if (!errMsg.includes('409')) {
        console.warn(`Warning: Secret creation issue: ${errMsg}`);
      }
    }

    // Step 3: Create ConfigMap
    try {
      await k8sJson(`/api/v1/namespaces/${encodedNs}/configmaps`, {
        method: 'POST',
        body: manifests.configMap,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : '';
      if (!errMsg.includes('409')) {
        console.warn(`Warning: ConfigMap creation issue: ${errMsg}`);
      }
    }

    // Step 4: Create Deployment
    await k8sJson(`/apis/apps/v1/namespaces/${encodedNs}/deployments`, {
      method: 'POST',
      body: manifests.deployment,
    });

    // Step 5: Create Service
    try {
      await k8sJson(`/api/v1/namespaces/${encodedNs}/services`, {
        method: 'POST',
        body: manifests.service,
      });
    } catch (error) {
      console.error(`Failed to create Service for ${config.name}, rolling back:`, error);
      await this.deleteAgent(config.name, namespace);
      throw error;
    }

    // Step 6: Create Middlewares (for strip-prefix routing)
    for (const middleware of manifests.middlewares) {
      try {
        await k8sJson(`/apis/traefik.io/v1alpha1/namespaces/${encodedNs}/middlewares`, {
          method: 'POST',
          body: middleware,
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : '';
        if (!errMsg.includes('409')) {
          console.warn(`Warning: Middleware creation issue: ${errMsg}`);
        }
      }
    }

    // Step 7: Create IngressRoute (Traefik CRD)
    try {
      await k8sJson(`/apis/traefik.io/v1alpha1/namespaces/${encodedNs}/ingressroutes`, {
        method: 'POST',
        body: manifests.ingressRoute,
      });
    } catch (error) {
      console.error(`Failed to create IngressRoute for ${config.name}, rolling back:`, error);
      await this.deleteAgent(config.name, namespace);
      throw error;
    }

    return {
      success: true,
      message: `OpenCode agent ${config.name} deployed successfully with ${config.templateType} template`,
      deploymentName: config.name,
    };
  }

  /**
   * Update OpenCode agent secret (e.g., rotate credentials).
   */
  async updateOpenCodeAgentSecret(
    name: string,
    secretData: Partial<{
      uiPassword: string;
      modelRouterToken: string;
      papApiKey: string;
      pluggedinApiKey: string;
    }>,
    namespace?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const ns = namespace || this.defaultNamespace;
      const encodedNs = encodePathSegment(ns);
      const secretName = encodePathSegment(`${name}-secrets`);

      // Build patch data (only include provided values)
      const encode = (s: string) => Buffer.from(s).toString('base64');
      const patchData: Record<string, string> = {};

      if (secretData.uiPassword) patchData['ui-password'] = encode(secretData.uiPassword);
      if (secretData.modelRouterToken) patchData['model-router-token'] = encode(secretData.modelRouterToken);
      if (secretData.papApiKey) patchData['pap-api-key'] = encode(secretData.papApiKey);
      if (secretData.pluggedinApiKey) patchData['pluggedin-api-key'] = encode(secretData.pluggedinApiKey);

      if (Object.keys(patchData).length === 0) {
        return { success: false, message: 'No secret data provided' };
      }

      await k8sJson(`/api/v1/namespaces/${encodedNs}/secrets/${secretName}`, {
        method: 'PATCH',
        body: { data: patchData },
      });

      // Restart deployment to pick up new secrets
      await this.restartDeployment(name, ns);

      return {
        success: true,
        message: `Secret updated and agent ${name} restarted`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: `Failed to update secret: ${errorMessage}`,
      };
    }
  }

  /**
   * Get container statuses for a multi-container OpenCode pod.
   */
  async getOpenCodeContainerStatuses(name: string, namespace?: string): Promise<Array<{
    name: string;
    essential: boolean;
    ready: boolean;
    state: string;
    stateReason?: string;
    restartCount: number;
  }>> {
    const podStatuses = await this.getAgentPodStatus(name, namespace);

    if (podStatuses.length === 0) {
      return [];
    }

    // Get the first (and typically only) pod
    const pod = podStatuses[0];

    // Essential containers from annotations would be parsed here
    // For now, we hardcode based on known container names
    const essentialContainers = new Set(['pap-client', 'agent-api']);

    return pod.containerStatuses.map((cs) => ({
      name: cs.name,
      essential: essentialContainers.has(cs.name),
      ready: cs.ready,
      state: cs.state,
      stateReason: cs.stateReason,
      restartCount: cs.restartCount,
    }));
  }
}

// Export singleton instance
export const kubernetesService = new KubernetesService();
