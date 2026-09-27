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

import { isReservedName } from '@/lib/agent-name-policy';
import type { AgentTemplateKind } from '@/lib/agents/template-kind';

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
  options: { method?: string; body?: string; contentType?: string; rawResponse?: boolean; suppressNotFound?: boolean } = {}
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
    // Skip logging 404s when suppressNotFound is set (expected during delete operations)
    const is404 = response.status === 404;
    if (!is404 || !options.suppressNotFound) {
      if (isDevelopment) {
        console.error(`[K8s] ${logMessage} - ${safeErrorInfo}`);
      } else {
        // Production: only log HTTP status, no K8s-specific details
        console.error(`[K8s] API error: ${response.status}`);
      }
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
  options: { method?: string; body?: object; contentType?: string; suppressNotFound?: boolean } = {}
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
  metadata: { name: string; namespace: string; uid?: string; labels?: Record<string, string> };
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
    metadata: { name: string; uid?: string };
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

interface K8sObjectResponse {
  metadata?: { name?: string; uid?: string; labels?: Record<string, string> };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resource Ownership
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Label binding a resource to the immutable agent identity. Resource names are
 * derived from the agent name, which is unique only while the agent row
 * exists, so the name alone never proves whose a resource is. Must match
 * resourceLabels() in lib/agents/opencode-manifests.ts.
 */
const AGENT_UUID_LABEL = 'pap.plugged.in/agent-uuid';

/** A resource exists under this agent's name but is not provably this agent's. */
class ResourceOwnershipError extends Error {}

/**
 * Why a name-addressed operation on an agent's Deployment was refused:
 * - not_found: there is no Deployment by that name.
 * - not_owned: there is one, but its owner label is not this agent's uuid.
 *   That includes unlabelled Deployments, which are either leftovers of a
 *   deleted agent or legacy agents deployed before ownership labels existed;
 *   an operator backfills the label on live legacy agents
 *   (docs/ops/agent-ownership-and-isolation-migration.md).
 */
export type AgentOperationCode = 'not_found' | 'not_owned';

export interface AgentOperationResult {
  success: boolean;
  message: string;
  code?: AgentOperationCode;
}

type OwnedDeployment =
  | { ok: true; path: string; uid: string; deployment: K8sDeploymentResponse }
  | { ok: false; code?: AgentOperationCode; message: string };

function isNotFoundError(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return errorMessage.includes('404') || errorMessage.includes('Not Found');
}

/**
 * Label selector for the pods of `agentUuid`'s Deployment `name`. Pods of a
 * leftover Deployment that shares the name carry no (or another) owner label
 * and never match.
 */
function ownedPodSelector(name: string, agentUuid: string): string {
  return encodeURIComponent(`app=${name},${AGENT_UUID_LABEL}=${agentUuid}`);
}

/** A resource a deploy created, so a failed deploy can remove exactly it. */
interface CreatedResource {
  collectionPath: string;
  name: string;
}

/**
 * Delete the members of a namespaced collection that match the selectors, in
 * one DELETE on the collection (RBAC verb `deletecollection`). The selection
 * happens server-side, so nothing is read first: no `get` permission is
 * needed, which matters for Secrets, where `get` would let the app's token
 * read every tenant's credentials.
 *
 * Returns how many objects were deleted (the API answers with the list of
 * deleted objects; 0 means nothing matched). The response body is never
 * logged: for Secrets it contains the deleted data.
 */
async function deleteCollection(
  collectionPath: string,
  selectors: { labelSelector?: string; fieldSelector: string }
): Promise<number> {
  const params = new URLSearchParams();
  if (selectors.labelSelector) params.set('labelSelector', selectors.labelSelector);
  params.set('fieldSelector', selectors.fieldSelector);
  const result = await k8sJson<{ items?: unknown[] }>(`${collectionPath}?${params.toString()}`, {
    method: 'DELETE',
    suppressNotFound: true,
  });
  return Array.isArray(result?.items) ? result.items.length : 0;
}

/** Selector matching only objects labelled for `agentUuid`. */
function ownedBy(agentUuid: string): string {
  return `${AGENT_UUID_LABEL}=${agentUuid}`;
}

/**
 * Everything an agent can own, by name. `kinds` are the templates whose
 * deploy creates it (see AgentTemplateKind); deleteAgent's legacy pass and
 * its error handling depend on it. Ordered networking first, then compute,
 * then configuration and storage.
 */
function agentResourceSpecs(
  name: string,
  encodedNs: string
): Array<{
  type: string;
  collectionPath: string;
  name: string;
  kinds: AgentTemplateKind[];
  legacyFieldSelector?: string;
  bestEffort?: boolean;
}> {
  const core = `/api/v1/namespaces/${encodedNs}`;
  const traefik = `/apis/traefik.io/v1alpha1/namespaces/${encodedNs}`;
  const networking = `/apis/networking.k8s.io/v1/namespaces/${encodedNs}`;
  return [
    // Traefik CRDs (OpenCode templates; strip-terminal only on legacy agents)
    { type: 'ingressroute', collectionPath: `${traefik}/ingressroutes`, name, kinds: ['opencode'] },
    { type: 'middleware-opencode', collectionPath: `${traefik}/middlewares`, name: `${name}-strip-opencode`, kinds: ['opencode'] },
    { type: 'middleware-terminal', collectionPath: `${traefik}/middlewares`, name: `${name}-strip-terminal`, kinds: ['opencode'] },
    { type: 'middleware-code', collectionPath: `${traefik}/middlewares`, name: `${name}-strip-code`, kinds: ['opencode'] },
    // cert-manager Certificate (OpenCode templates; the standard Ingress's
    // Certificate is created by cert-manager, owned by the Ingress, and
    // garbage-collected with it)
    {
      type: 'certificate',
      collectionPath: `/apis/cert-manager.io/v1/namespaces/${encodedNs}/certificates`,
      name: `${name}-tls`,
      kinds: ['opencode'],
    },
    // Standard Kubernetes networking
    { type: 'ingress', collectionPath: `${networking}/ingresses`, name, kinds: ['standard'] },
    { type: 'service', collectionPath: `${core}/services`, name, kinds: ['standard', 'opencode'] },
    // Compute
    { type: 'deployment', collectionPath: `/apis/apps/v1/namespaces/${encodedNs}/deployments`, name, kinds: ['standard', 'opencode'] },
    // Pod isolation (OpenCode templates) - after the pods it protects
    { type: 'networkpolicy', collectionPath: `${networking}/networkpolicies`, name: `${name}-netpol`, kinds: ['opencode'] },
    // Config and secrets
    { type: 'configmap', collectionPath: `${core}/configmaps`, name: `${name}-config`, kinds: ['opencode'] },
    { type: 'secret', collectionPath: `${core}/secrets`, name: `${name}-secrets`, kinds: ['opencode'] },
    // Written by cert-manager for either template, never labelled by the app
    {
      type: 'tls-secret',
      collectionPath: `${core}/secrets`,
      name: `${name}-tls`,
      kinds: ['standard', 'opencode'],
      legacyFieldSelector: 'type=kubernetes.io/tls',
      bestEffort: true,
    },
    // Storage (OpenCode templates)
    { type: 'pvc', collectionPath: `${core}/persistentvolumeclaims`, name: `${name}-workspace`, kinds: ['opencode'] },
  ];
}

/**
 * The Kubernetes permissions the agent manager (this service) needs in each
 * agent namespace, and nothing more. docs/ops/pap-agent-manager-rbac.yaml is
 * the Role granting exactly these (a test keeps the two identical), and
 * checkAgentManagerAccess() verifies them against the live token.
 *
 * - get on a type: only for the ownership check when a create hits 409
 *   (createOwnedResource), and for Deployments the ownership check of every
 *   name-addressed operation. Never on Secrets: the app must not be able to
 *   read other tenants' credentials, so an existing Secret is refused unread.
 * - deletecollection: teardown and rollback (deleteAgent, rollbackCreated).
 *   No plain `delete` is used.
 * - Deployments: patch for scale/restart/upgrade, list for the admin cluster
 *   view. Pods: list (by owner label) and get pods/log. Events: list.
 */
export const AGENT_MANAGER_PERMISSIONS: ReadonlyArray<{ group: string; resource: string; verbs: string[] }> = [
  { group: 'apps', resource: 'deployments', verbs: ['get', 'list', 'create', 'patch', 'deletecollection'] },
  { group: '', resource: 'pods', verbs: ['list'] },
  { group: '', resource: 'pods/log', verbs: ['get'] },
  { group: '', resource: 'events', verbs: ['list'] },
  { group: '', resource: 'services', verbs: ['get', 'create', 'deletecollection'] },
  { group: '', resource: 'configmaps', verbs: ['get', 'create', 'deletecollection'] },
  { group: '', resource: 'persistentvolumeclaims', verbs: ['get', 'create', 'deletecollection'] },
  { group: '', resource: 'secrets', verbs: ['create', 'deletecollection'] },
  { group: 'networking.k8s.io', resource: 'ingresses', verbs: ['get', 'create', 'deletecollection'] },
  { group: 'networking.k8s.io', resource: 'networkpolicies', verbs: ['get', 'create', 'deletecollection'] },
  { group: 'traefik.io', resource: 'middlewares', verbs: ['get', 'create', 'deletecollection'] },
  { group: 'traefik.io', resource: 'ingressroutes', verbs: ['get', 'create', 'deletecollection'] },
  { group: 'cert-manager.io', resource: 'certificates', verbs: ['get', 'create', 'deletecollection'] },
];

/**
 * Create a namespaced resource for `agentUuid`, recording it in `created` so
 * a failed deploy can roll back exactly what it made.
 *
 * On 409 AlreadyExists the existing object is read, and reused only if it is
 * labelled with this agent's uuid (a retried deploy of the same agent).
 * Anything else — another agent's label, no label, or a label that cannot be
 * read — is refused: never adopted, patched or deleted. A freed name must not
 * hand its new owner the previous owner's workspace or credentials.
 *
 * `ownerReadable: false` (Secrets) refuses any 409 without reading the
 * existing object: the app is deliberately not allowed to `get` Secrets, and
 * a deploy is never retried, so an existing Secret is never this agent's.
 */
async function createOwnedResource(
  collectionPath: string,
  manifest: object,
  agentUuid: string,
  created: CreatedResource[],
  options: { ownerReadable?: boolean } = {}
): Promise<void> {
  const name = (manifest as K8sObjectResponse).metadata?.name;
  if (!name) {
    throw new Error('Manifest has no metadata.name');
  }
  const resourcePath = `${collectionPath}/${encodePathSegment(name)}`;

  try {
    await k8sJson(collectionPath, { method: 'POST', body: manifest });
    created.push({ collectionPath, name });
    return;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '';
    if (!errMsg.includes('409')) {
      throw error;
    }
  }

  if (options.ownerReadable === false) {
    throw new ResourceOwnershipError(
      `${name} already exists; it is not owned by this agent (Secrets are never read, and a deploy never meets its own); refusing to reuse it`
    );
  }

  let owner: string | undefined;
  try {
    const existing = await k8sJson<K8sObjectResponse>(resourcePath);
    owner = existing.metadata?.labels?.[AGENT_UUID_LABEL];
  } catch {
    throw new ResourceOwnershipError(
      `${name} already exists and its owner could not be verified; refusing to reuse it`
    );
  }
  if (owner !== agentUuid) {
    throw new ResourceOwnershipError(
      `${name} already exists and is not owned by this agent (it belongs to another agent or predates ownership labels); refusing to reuse it`
    );
  }
  // Already this agent's: nothing to do.
}

/**
 * Remove the resources a failed deploy created, newest first. Each delete is
 * scoped to the created name AND this agent's owner label, so a resource that
 * merely shares the name (or replaced ours in between) is never touched.
 */
async function rollbackCreated(created: CreatedResource[], agentUuid: string): Promise<void> {
  for (const resource of [...created].reverse()) {
    try {
      await deleteCollection(resource.collectionPath, {
        labelSelector: ownedBy(agentUuid),
        fieldSelector: `metadata.name=${resource.name}`,
      });
    } catch (error) {
      console.warn(`Warning: rollback could not delete ${resource.name}:`, error);
    }
  }
}

/** Outcome of deployAgent / deployOpenCodeAgent. */
export interface AgentDeployResult {
  success: boolean;
  message: string;
  deploymentName: string;
  /**
   * The deploy was refused because a resource by this agent's name already
   * exists and is not this agent's (a leftover of a deleted agent, or another
   * agent's). Nothing under the name belongs to this agent, so the caller
   * must not record the name as this agent's deployment.
   */
  ownershipConflict?: boolean;
}

/**
 * Run a deploy under the overall timeout. `withTimeout` does not cancel the
 * requests in flight: if they succeed after the caller was told the deploy
 * failed, remove what they created, so a failed deploy leaves nothing behind
 * under the agent's name. (A deploy that fails by itself rolls back itself.)
 */
async function runDeploy(
  config: { name: string; agentUuid: string },
  timeoutMs: number,
  labels: { operation: string; failure: string },
  work: (created: CreatedResource[]) => Promise<AgentDeployResult>
): Promise<AgentDeployResult> {
  const created: CreatedResource[] = [];
  const pending = work(created);
  try {
    return await withTimeout(pending, timeoutMs, `${labels.operation} (${config.name})`);
  } catch (error) {
    pending.then(
      () => rollbackCreated(created, config.agentUuid),
      () => undefined
    );
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `${labels.failure}: ${errorMessage}`,
      deploymentName: config.name,
      ownershipConflict: error instanceof ResourceOwnershipError,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Manifest Builder Functions
// ─────────────────────────────────────────────────────────────────────────────

interface ManifestConfig {
  name: string;
  namespace: string;
  dnsName: string;
  agentUuid: string;
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

/** Resource labels, including the owner label (see AGENT_UUID_LABEL). */
function standardResourceLabels(config: ManifestConfig): Record<string, string> {
  return { app: config.name, 'pap-agent': 'true', [AGENT_UUID_LABEL]: config.agentUuid };
}

function buildDeploymentManifest(config: ManifestConfig): object {
  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: config.name,
      namespace: config.namespace,
      labels: standardResourceLabels(config),
    },
    spec: {
      replicas: 1,
      // The selector is immutable, so it stays `app`; the owner label goes on
      // the pod template so pods can be selected by owner, not by name.
      selector: { matchLabels: { app: config.name } },
      template: {
        metadata: { labels: standardResourceLabels(config) },
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
      labels: standardResourceLabels(config),
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
      labels: standardResourceLabels(config),
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
  agentUuid: string; // Owner label on every resource (AGENT_UUID_LABEL)
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
  async deployAgent(config: AgentDeploymentConfig): Promise<AgentDeployResult> {
    return runDeploy(
      config,
      K8S_DEPLOY_TIMEOUT_MS,
      { operation: 'Agent deployment', failure: 'Failed to deploy agent' },
      (created) => this._deployAgentInternal(config, created)
    );
  }

  /**
   * Internal deployment logic (called with timeout wrapper).
   */
  private async _deployAgentInternal(
    config: AgentDeploymentConfig,
    created: CreatedResource[]
  ): Promise<AgentDeployResult> {
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
      agentUuid: config.agentUuid,
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

    // `created` collects what this call made; a failure rolls back exactly
    // those, never a resource that merely shares the agent's name.

    // Create Deployment first (required for Service/Ingress to work)
    await createOwnedResource(
      `/apis/apps/v1/namespaces/${encodedNamespace}/deployments`,
      buildDeploymentManifest(manifestConfig),
      config.agentUuid,
      created
    );

    // Create Service and Ingress in parallel (both depend on Deployment).
    // allSettled, so the rollback never races a create still in flight.
    const results = await Promise.allSettled([
      createOwnedResource(
        `/api/v1/namespaces/${encodedNamespace}/services`,
        buildServiceManifest(manifestConfig),
        config.agentUuid,
        created
      ),
      createOwnedResource(
        `/apis/networking.k8s.io/v1/namespaces/${encodedNamespace}/ingresses`,
        buildIngressManifest(manifestConfig),
        config.agentUuid,
        created
      ),
    ]);
    const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failure) {
      // Rollback on Service/Ingress failure
      console.error(`Failed to create Service/Ingress for ${config.name}, rolling back:`, failure.reason);
      await rollbackCreated(created, config.agentUuid);
      throw failure.reason;
    }

    return {
      success: true,
      message: `Agent ${config.name} deployed successfully`,
      deploymentName: config.name,
    };
  }

  /**
   * Read the Deployment `name` and confirm it is `agentUuid`'s.
   *
   * Every name-addressed operation goes through this. The name alone proves
   * nothing: it is unique only while the agent row exists, so a Deployment by
   * that name may be a leftover of a deleted agent (unlabelled, or labelled
   * with another uuid). Such a Deployment is never read out, scaled,
   * restarted or re-imaged on behalf of the new holder of the name.
   */
  private async readOwnedDeployment(
    name: string,
    namespace: string | undefined,
    agentUuid: string
  ): Promise<OwnedDeployment> {
    const ns = namespace || this.defaultNamespace;

    // SECURITY: Validate namespace against allowlist
    const namespaceError = validateNamespace(ns);
    if (namespaceError) {
      return { ok: false, message: namespaceError };
    }
    if (!agentUuid) {
      return { ok: false, code: 'not_owned', message: 'Agent identity is required to manage its Deployment' };
    }

    // SECURITY: Encode path segments
    const path = `/apis/apps/v1/namespaces/${encodePathSegment(ns)}/deployments/${encodePathSegment(name)}`;

    let deployment: K8sDeploymentResponse;
    try {
      deployment = await k8sJson<K8sDeploymentResponse>(path, { suppressNotFound: true });
    } catch (error) {
      if (isNotFoundError(error)) {
        return { ok: false, code: 'not_found', message: `Deployment ${name} not found` };
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { ok: false, message: `Could not read Deployment ${name}: ${errorMessage}` };
    }

    const owner = deployment.metadata?.labels?.[AGENT_UUID_LABEL];
    if (owner !== agentUuid) {
      return {
        ok: false,
        code: 'not_owned',
        message: owner
          ? `Deployment ${name} belongs to a different agent; refusing to manage it`
          : `Deployment ${name} has no ownership label (a leftover, or an agent deployed before ownership labels); refusing to manage it until an operator backfills the label`,
      };
    }

    const uid = deployment.metadata?.uid;
    if (!uid) {
      return { ok: false, message: `Deployment ${name} has no uid; refusing to manage it` };
    }

    return { ok: true, path, uid, deployment };
  }

  /**
   * Get deployment status for an agent via Kubernetes API.
   * Returns null unless the Deployment exists and is `agentUuid`'s.
   */
  async getDeploymentStatus(name: string, namespace: string | undefined, agentUuid: string): Promise<DeploymentStatus | null> {
    try {
      const owned = await this.readOwnedDeployment(name, namespace, agentUuid);
      if (!owned.ok) {
        return null;
      }

      const status = owned.deployment.status || {};

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
   * Delete an agent's Kubernetes resources.
   *
   * Every delete is a DELETE on the resource's collection whose selectors do
   * the ownership check server-side, so nothing is read first and the app
   * needs `deletecollection`, never `get`, on each type (see
   * AGENT_MANAGER_PERMISSIONS; the app must not be able to read Secrets):
   *
   * 1. Owned pass, every resource type: `pap.plugged.in/agent-uuid=<uuid>`
   *    and `metadata.name=<name>`. Only this agent's resources match.
   * 2. Legacy pass, only the types this agent's template creates:
   *    `!pap.plugged.in/agent-uuid` and `metadata.name=<name>`, for agents
   *    deployed before ownership labels existed. Resources labelled for
   *    another agent never match either pass. Limiting it to the template's
   *    types means a standard agent that registers a freed name cannot
   *    delete the unlabelled workspace or credentials some deleted OpenCode
   *    agent left under it. (The API applies the selector when it lists the
   *    collection and deletes what matched; there is no per-object uid
   *    precondition, which is acceptable because only the app creates
   *    resources under agent names.)
   *
   * Errors:
   * - 404 on a collection: the type is not served (e.g. Traefik or
   *   cert-manager CRDs not installed) or the namespace is gone, so nothing
   *   of that type can exist.
   * - Any other error (403 included) on a type the template creates: the
   *   resource cannot be proven absent, so the teardown fails and the caller
   *   must keep the agent's name reserved.
   * - Any error on a type the template never creates, or on the cert-manager
   *   TLS Secret: reported in `ignoredResources`, not a failure. The app never
   *   created such a resource for this agent (the owned pass could only match
   *   an object the app labelled for this uuid). The TLS Secret is created by
   *   cert-manager, holds only a certificate for the agent's own hostname
   *   whose key tenants never see, and is reused, not adopted, by a later
   *   agent with the same name; leaving it is not worth blocking an account
   *   or Hub deletion over.
   *
   * Reserved names (shared infrastructure) are refused outright.
   */
  async deleteAgent(
    name: string,
    namespace: string | undefined,
    agentUuid: string,
    options: { templateKind: AgentTemplateKind }
  ): Promise<{
    success: boolean;
    message: string;
    deletedResources?: string[];
    skippedResources?: string[];
    failedResources?: string[];
    ignoredResources?: string[];
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

    // SECURITY: Never delete by a reserved name. Shared infrastructure in the
    // agents namespace (pap-collector, wildcard TLS, ...) lives under them.
    if (isReservedName(name)) {
      return {
        success: false,
        message: `Refusing to delete Kubernetes resources for reserved name '${name}'`,
      };
    }

    if (!agentUuid) {
      return {
        success: false,
        message: 'Agent identity is required to delete Kubernetes resources',
      };
    }

    const deleted: string[] = [];
    const skipped: string[] = []; // Nothing of that type under the name - fine
    const failed: string[] = [];
    const ignored: string[] = [];
    let forbidden = false;

    for (const spec of agentResourceSpecs(name, encodePathSegment(ns))) {
      const required = spec.kinds.includes(options.templateKind) && !spec.bestEffort;
      const passes: Array<{ labelSelector: string; fieldSelector: string }> = [
        { labelSelector: ownedBy(agentUuid), fieldSelector: `metadata.name=${spec.name}` },
      ];
      if (spec.kinds.includes(options.templateKind)) {
        passes.push({
          labelSelector: `!${AGENT_UUID_LABEL}`,
          fieldSelector: `metadata.name=${spec.name}${spec.legacyFieldSelector ? `,${spec.legacyFieldSelector}` : ''}`,
        });
      }

      let count = 0;
      let error: unknown;
      for (const pass of passes) {
        try {
          count += await deleteCollection(spec.collectionPath, pass);
        } catch (e) {
          if (!isNotFoundError(e)) {
            error = e;
            break;
          }
        }
      }

      if (error === undefined) {
        (count > 0 ? deleted : skipped).push(spec.type);
        continue;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('403')) forbidden = true;
      if (required) {
        console.warn(`Warning: Could not delete ${spec.type} for ${name}: ${errorMessage}`);
        failed.push(spec.type);
      } else {
        console.warn(`Warning: ${spec.type} for ${name} not verified (${errorMessage}); not required for this agent`);
        ignored.push(spec.type);
      }
    }

    if (forbidden) {
      void this.warnAboutMissingPermissionsOnce(ns);
    }

    const success = failed.length === 0;
    return {
      success,
      message: success
        ? `Agent ${name} deleted successfully (${deleted.length} resource types deleted, ${skipped.length} not present)`
        : `Agent ${name} partially deleted. Failed: ${failed.join(', ')}`,
      deletedResources: deleted.length > 0 ? deleted : undefined,
      skippedResources: skipped.length > 0 ? skipped : undefined,
      failedResources: failed.length > 0 ? failed : undefined,
      ignoredResources: ignored.length > 0 ? ignored : undefined,
    };
  }

  /**
   * Check, with SelfSubjectAccessReview, that the app's token holds every
   * permission in AGENT_MANAGER_PERMISSIONS in `namespace`. Returns the
   * missing ones as "verb group/resource". Read-only; creating a
   * SelfSubjectAccessReview is allowed for every authenticated identity.
   */
  async checkAgentManagerAccess(namespace?: string): Promise<{ ok: boolean; missing: string[] }> {
    const ns = namespace || this.defaultNamespace;
    const missing: string[] = [];
    for (const permission of AGENT_MANAGER_PERMISSIONS) {
      const [resource, subresource] = permission.resource.split('/');
      for (const verb of permission.verbs) {
        const review = await k8sJson<{ status?: { allowed?: boolean } }>(
          '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews',
          {
            method: 'POST',
            body: {
              apiVersion: 'authorization.k8s.io/v1',
              kind: 'SelfSubjectAccessReview',
              spec: {
                resourceAttributes: {
                  namespace: ns,
                  verb,
                  group: permission.group,
                  resource,
                  ...(subresource ? { subresource } : {}),
                },
              },
            },
          }
        );
        if (!review.status?.allowed) {
          missing.push(`${verb} ${permission.group}/${permission.resource}`);
        }
      }
    }
    return { ok: missing.length === 0, missing };
  }

  private rbacWarned = new Set<string>();

  /** After a 403, log once per namespace which permissions the token lacks. */
  private async warnAboutMissingPermissionsOnce(namespace: string): Promise<void> {
    if (this.rbacWarned.has(namespace)) return;
    this.rbacWarned.add(namespace);
    try {
      const report = await this.checkAgentManagerAccess(namespace);
      if (!report.ok) {
        console.error(
          `[K8s] The Kubernetes token lacks permissions the agent manager needs in namespace ${namespace}: ` +
            `${report.missing.join(', ')}. Apply docs/ops/pap-agent-manager-rbac.yaml ` +
            '(see docs/ops/agent-ownership-and-isolation-migration.md).'
        );
      }
    } catch (error) {
      console.error('[K8s] Could not check agent manager permissions:', error instanceof Error ? error.message : error);
    }
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
   * Scale an agent deployment. Refused unless the Deployment is `agentUuid`'s.
   *
   * Patches the Deployment itself rather than its /scale subresource, so the
   * patch can carry the uid that was checked: if the Deployment was replaced
   * after the ownership check, the API rejects the patch.
   */
  async scaleAgent(
    name: string,
    replicas: number,
    namespace: string | undefined,
    agentUuid: string
  ): Promise<AgentOperationResult> {
    try {
      const owned = await this.readOwnedDeployment(name, namespace, agentUuid);
      if (!owned.ok) {
        return { success: false, message: owned.message, code: owned.code };
      }

      await k8sJson(owned.path, {
        method: 'PATCH',
        body: { metadata: { uid: owned.uid }, spec: { replicas } },
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
   * Refused unless the Deployment is `agentUuid`'s.
   */
  async restartDeployment(
    name: string,
    namespace: string | undefined,
    agentUuid: string
  ): Promise<AgentOperationResult> {
    try {
      const owned = await this.readOwnedDeployment(name, namespace, agentUuid);
      if (!owned.ok) {
        return { success: false, message: owned.message, code: owned.code };
      }

      // Add restart annotation (Kubernetes way to trigger rolling restart).
      // Strategic merge keeps the other annotations; the uid pins the patch to
      // the Deployment whose owner label was checked.
      const now = new Date().toISOString();
      await k8sJson(owned.path, {
        method: 'PATCH',
        body: {
          metadata: { uid: owned.uid },
          spec: { template: { metadata: { annotations: { 'kubectl.kubernetes.io/restartedAt': now } } } },
        },
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
   * List the pods of `agentUuid`'s Deployment `name`, selected by the owner
   * label (never by the reusable name alone).
   */
  private async listOwnedPods(
    name: string,
    namespace: string | undefined,
    agentUuid: string
  ): Promise<{ encodedNs: string; items: K8sPodListResponse['items'] }> {
    const ns = namespace || this.defaultNamespace;
    const namespaceError = validateNamespace(ns);
    if (namespaceError) {
      throw new Error(namespaceError);
    }
    if (!agentUuid) {
      throw new Error('Agent identity is required to list its pods');
    }
    // SECURITY: Encode path segments and query parameters
    const encodedNs = encodePathSegment(ns);
    const pods = await k8sJson<K8sPodListResponse>(
      `/api/v1/namespaces/${encodedNs}/pods?labelSelector=${ownedPodSelector(name, agentUuid)}`
    );
    return { encodedNs, items: pods.items || [] };
  }

  /**
   * Get logs from one of `agentUuid`'s pods via Kubernetes API.
   */
  async getAgentLogs(
    name: string,
    namespace: string | undefined,
    agentUuid: string,
    tailLines: number = 100
  ): Promise<string | null> {
    try {
      const { encodedNs, items } = await this.listOwnedPods(name, namespace, agentUuid);

      if (items.length === 0) {
        console.warn(`No pods found for deployment ${name}`);
        return null;
      }

      // Find a running pod (prefer running pods)
      const runningPod = items.find((pod) => pod.status?.phase === 'Running');
      const targetPod = runningPod || items[0];
      const podName = targetPod.metadata?.name;

      if (!podName) {
        console.warn(`Could not determine pod name for deployment ${name}`);
        return null;
      }

      // SECURITY: Encode pod name for URL path; bound the tail length
      const encodedPodName = encodePathSegment(podName);
      const tail = Number.isFinite(tailLines) ? Math.min(Math.max(Math.floor(tailLines), 1), 1000) : 100;

      // Get logs from the pod (returns plain text)
      try {
        return await k8sText(
          `/api/v1/namespaces/${encodedNs}/pods/${encodedPodName}/log?tailLines=${tail}&timestamps=true`
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
   * Get events for `agentUuid`'s Deployment and pods. Events are selected by
   * the uid of an object whose ownership was checked, so a leftover
   * Deployment or pod sharing the name contributes nothing.
   */
  async getAgentEvents(name: string, namespace: string | undefined, agentUuid: string): Promise<Array<{
    type: string;
    reason: string;
    message: string;
    count: number;
    firstTimestamp: string;
    lastTimestamp: string;
    source: string;
  }>> {
    try {
      const { encodedNs, items: pods } = await this.listOwnedPods(name, namespace, agentUuid);
      const owned = await this.readOwnedDeployment(name, namespace, agentUuid);

      const involved: Array<{ kind: string; name: string; uid?: string }> = [];
      if (owned.ok) {
        involved.push({ kind: 'Deployment', name, uid: owned.uid });
      }
      for (const pod of pods) {
        involved.push({ kind: 'Pod', name: pod.metadata.name, uid: pod.metadata.uid });
      }

      const results = await Promise.allSettled(
        involved.map((obj) => {
          const selector = obj.uid
            ? `involvedObject.kind=${obj.kind},involvedObject.uid=${obj.uid}`
            : `involvedObject.kind=${obj.kind},involvedObject.name=${obj.name}`;
          return k8sJson<K8sEventListResponse>(
            `/api/v1/namespaces/${encodedNs}/events?fieldSelector=${encodeURIComponent(selector)}`
          );
        })
      );

      const allEvents: K8sEventListResponse['items'] = [];
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'fulfilled') {
          allEvents.push(...(result.value.items || []));
        } else {
          // Pod might have been deleted
          console.warn(`Could not get events for ${involved[i].kind} ${involved[i].name}:`, result.reason);
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
   * Get pod status details for `agentUuid`'s pods.
   */
  async getAgentPodStatus(name: string, namespace: string | undefined, agentUuid: string): Promise<Array<{
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
      const { items } = await this.listOwnedPods(name, namespace, agentUuid);

      return items.map((pod) => {
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
   * Refused unless the Deployment is `config.agentUuid`'s: re-imaging a
   * leftover Deployment would run new code with its previous owner's
   * credentials in the environment.
   */
  async upgradeAgent(config: {
    name: string;
    namespace?: string;
    agentUuid: string;
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
  }): Promise<AgentOperationResult> {
    try {
      const owned = await this.readOwnedDeployment(config.name, config.namespace, config.agentUuid);
      if (!owned.ok) {
        return { success: false, message: owned.message, code: owned.code };
      }

      // Build the patch object. metadata.uid pins it to the checked Deployment.
      const patch: Record<string, unknown> = {
        metadata: { uid: owned.uid },
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
      await k8sJson(owned.path, {
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
  }): Promise<AgentDeployResult> {
    return runDeploy(
      config,
      K8S_DEPLOY_TIMEOUT_MS * 2, // Double timeout for multi-container
      { operation: 'OpenCode agent deployment', failure: 'Failed to deploy OpenCode agent' },
      (created) => this._deployOpenCodeAgentInternal(config, created)
    );
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
  }, created: CreatedResource[]): Promise<AgentDeployResult> {
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

    // `created` collects what this call made; a failure rolls back exactly
    // those. Resources that already exist are reused only if labelled with
    // this agent's uuid (see createOwnedResource) - never adopted from a
    // previous owner of the name.
    const create = (collectionPath: string, manifest: object, options?: { ownerReadable?: boolean }) =>
      createOwnedResource(collectionPath, manifest, config.agentUuid, created, options);

    // Non-fatal steps keep their historical "warn and continue" behaviour for
    // API errors, but an ownership conflict is always fatal.
    const createOptional = async (
      label: string,
      collectionPath: string,
      manifest: object,
      options?: { ownerReadable?: boolean }
    ) => {
      try {
        await create(collectionPath, manifest, options);
      } catch (error) {
        if (error instanceof ResourceOwnershipError) throw error;
        const errMsg = error instanceof Error ? error.message : '';
        console.warn(`Warning: ${label} creation issue: ${errMsg}`);
      }
    };

    try {
      // Step 1: Create PVC (must exist before deployment)
      await createOptional('PVC', `/api/v1/namespaces/${encodedNs}/persistentvolumeclaims`, manifests.pvc);

      // Step 2: Create Secret
      // The app may not read Secrets (RBAC), so an existing one is refused unread.
      await createOptional('Secret', `/api/v1/namespaces/${encodedNs}/secrets`, manifests.secret, {
        ownerReadable: false,
      });

      // Step 3: Create ConfigMap
      await createOptional('ConfigMap', `/api/v1/namespaces/${encodedNs}/configmaps`, manifests.configMap);

      // Step 4: Create NetworkPolicy before any pod exists, so the pods are
      // never reachable from other tenants' pods. Required: without it every
      // pod in the shared namespace can reach this agent's listeners.
      await create(`/apis/networking.k8s.io/v1/namespaces/${encodedNs}/networkpolicies`, manifests.networkPolicy);

      // Step 5: Create Deployment
      await create(`/apis/apps/v1/namespaces/${encodedNs}/deployments`, manifests.deployment);

      // Step 6: Create Service
      await create(`/api/v1/namespaces/${encodedNs}/services`, manifests.service);

      // Step 7: Create Middlewares (for strip-prefix routing)
      for (const middleware of manifests.middlewares) {
        await createOptional('Middleware', `/apis/traefik.io/v1alpha1/namespaces/${encodedNs}/middlewares`, middleware);
      }

      // Step 8: Create Certificate (cert-manager) - must exist before IngressRoute
      await createOptional('Certificate', `/apis/cert-manager.io/v1/namespaces/${encodedNs}/certificates`, manifests.certificate);

      // Step 9: Create IngressRoute (Traefik CRD)
      await create(`/apis/traefik.io/v1alpha1/namespaces/${encodedNs}/ingressroutes`, manifests.ingressRoute);
    } catch (error) {
      console.error(`Failed to deploy OpenCode agent ${config.name}, rolling back:`, error);
      await rollbackCreated(created, config.agentUuid);
      throw error;
    }

    return {
      success: true,
      message: `OpenCode agent ${config.name} deployed successfully with ${config.templateType} template`,
      deploymentName: config.name,
    };
  }

  /**
   * Get container statuses for `agentUuid`'s multi-container OpenCode pod.
   */
  async getOpenCodeContainerStatuses(name: string, namespace: string | undefined, agentUuid: string): Promise<Array<{
    name: string;
    essential: boolean;
    ready: boolean;
    state: string;
    stateReason?: string;
    restartCount: number;
  }>> {
    const podStatuses = await this.getAgentPodStatus(name, namespace, agentUuid);

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
