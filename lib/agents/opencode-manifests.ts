/**
 * OpenCode Template Manifest Builder
 *
 * Generates Kubernetes manifests for multi-container OpenCode agent pods.
 * Supports two templates:
 * - opencode-ide: VSCode + OpenCode terminal integration
 * - opencode-chamber: Chat UI with per-pod OpenCode server
 *
 * Architecture Note:
 * Each agent gets its own opencode-serve container for full tenant isolation.
 * This ensures session data, conversation history, and credentials are
 * completely isolated between tenants.
 *
 * Both templates include essential containers (pap-client, agent-api) that
 * never shut down, and non-essential containers that scale down on idle.
 *
 * Isolation: every tenant's pod runs in the same namespace, so anything a pod
 * listens on is reachable from every other tenant's pod unless it is bound to
 * loopback. Unauthenticated listeners (the ttyd shell, the OpenCode API) are
 * therefore `loopbackOnly`: bound to 127.0.0.1 and never published on the
 * Service. A NetworkPolicy additionally limits ingress to the ingress
 * controller and the agent's own pods.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ContainerSpec {
  name: string;
  image: string;
  port: number;
  portName: string;
  essential: boolean; // Never scales down if true
  idleTimeoutMinutes?: number; // For non-essential containers
  // Listener is bound to 127.0.0.1 and reachable only from inside the pod (or
  // `kubectl port-forward`). It is never added to the Service or declared as a
  // container port. Required for anything that does not authenticate callers.
  loopbackOnly?: boolean;
  env?: Array<{ name: string; value?: string; valueFrom?: object }>;
  resources: {
    cpuRequest: string;
    memoryRequest: string;
    cpuLimit: string;
    memoryLimit: string;
  };
  volumeMounts?: Array<{
    name: string;
    mountPath: string;
    readOnly?: boolean;
  }>;
  livenessProbe?: {
    httpGet?: { path: string; port: number };
    exec?: { command: string[] };
    initialDelaySeconds?: number;
    periodSeconds?: number;
    timeoutSeconds?: number;
  };
  readinessProbe?: {
    httpGet?: { path: string; port: number };
    exec?: { command: string[] };
    initialDelaySeconds?: number;
    periodSeconds?: number;
    timeoutSeconds?: number;
  };
  command?: string[];
  args?: string[];
  workingDir?: string;
}

export interface InitContainerSpec {
  name: string;
  image: string;
  command?: string[];
  args?: string[];
  env?: Array<{ name: string; value?: string; valueFrom?: object }>;
  volumeMounts?: Array<{
    name: string;
    mountPath: string;
  }>;
}

export interface VolumeSpec {
  name: string;
  type: 'pvc' | 'configMap' | 'secret' | 'emptyDir';
  pvcName?: string;
  configMapName?: string;
  secretName?: string;
}

export interface OpenCodeAgentConfig {
  name: string;
  namespace: string;
  dnsName: string; // Full DNS: {name}.is.plugged.in
  templateType: 'opencode-ide' | 'opencode-chamber';

  // Secrets and config references
  secretName: string; // agent-{name}-secrets
  configMapName: string; // agent-{name}-config

  // User configuration
  uiPassword: string; // For code-server or openchamber auth
  defaultModel: string; // e.g., 'claude-sonnet-4-20250514'

  // Environment from PAP
  agentUuid: string;
  modelRouterUrl: string; // Region-specific Model Router URL
  modelRouterToken: string;
  papApiKey: string;
  pluggedinApiKey: string;

  // Optional overrides
  workspaceStorageSize?: string; // e.g., '10Gi'
  // Namespace of the ingress controller (Traefik) allowed through the
  // NetworkPolicy. K3s runs its bundled Traefik in kube-system.
  ingressControllerNamespace?: string;
}

const DEFAULT_INGRESS_CONTROLLER_NAMESPACE = 'kube-system';

/**
 * Owner label: binds a resource to the immutable agent identity, so
 * management code can tell whose resource it is instead of trusting a
 * reusable name. Must match AGENT_UUID_LABEL in lib/services/kubernetes-service.ts.
 */
export const AGENT_OWNER_LABEL = 'pap.plugged.in/agent-uuid';

/** Labels on every resource (and on the pods), including the owner label. */
function resourceLabels(config: OpenCodeAgentConfig): Record<string, string> {
  return {
    app: config.name,
    'pap-agent': 'true',
    [AGENT_OWNER_LABEL]: config.agentUuid,
  };
}

/**
 * Health check for a loopback-only listener: the kubelet probes the pod IP, so
 * an httpGet probe cannot reach it. Runs inside the container with whichever
 * of wget/curl the image has; with neither, the probe passes (no worse than
 * having no probe) rather than restart-looping the container.
 */
function loopbackHealthCheck(url: string): string[] {
  return [
    '/bin/sh',
    '-c',
    `if command -v wget >/dev/null 2>&1; then exec wget -q -O /dev/null ${url}; ` +
      `elif command -v curl >/dev/null 2>&1; then exec curl -fsS -o /dev/null ${url}; fi`,
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Container Configurations
// ─────────────────────────────────────────────────────────────────────────────

const COMMON_ENV = (config: OpenCodeAgentConfig): Array<{ name: string; value?: string; valueFrom?: object }> => [
  { name: 'AGENT_NAME', value: config.name },
  { name: 'AGENT_UUID', value: config.agentUuid },
  { name: 'AGENT_DOMAIN', value: config.dnsName },
  // PAP identity and auth (same as PAP_AGENT_* for compatibility)
  { name: 'PAP_AGENT_ID', value: config.agentUuid },
  { name: 'PAP_AGENT_DNS', value: config.dnsName },
  { name: 'PAP_STATION_URL', value: 'https://plugged.in' },
  { name: 'PAP_API_KEY', valueFrom: { secretKeyRef: { name: config.secretName, key: 'pap-api-key' } } },
  { name: 'PAP_AGENT_KEY', valueFrom: { secretKeyRef: { name: config.secretName, key: 'pap-api-key' } } },
  // PAP Collector for heartbeats (local K8s service)
  // Agents send heartbeats to local collector instead of central station
  { name: 'PAP_COLLECTOR_URL', value: 'http://pap-collector.agents.svc:8080' },
  // Plugged.in API access
  { name: 'PLUGGEDIN_API_URL', value: 'https://plugged.in' },
  { name: 'PLUGGEDIN_API_KEY', valueFrom: { secretKeyRef: { name: config.secretName, key: 'pluggedin-api-key' } } },
  // Model Router for LLM access
  { name: 'MODEL_ROUTER_URL', value: config.modelRouterUrl },
  { name: 'MODEL_ROUTER_TOKEN', valueFrom: { secretKeyRef: { name: config.secretName, key: 'model-router-token' } } },
  // MCP Proxy for tool access
  { name: 'MCP_PROXY_URL', value: 'https://mcp.plugged.in/mcp' },
];

// Essential containers (always running)
const PAP_CLIENT_CONTAINER: ContainerSpec = {
  name: 'pap-client',
  image: 'ghcr.io/veriteknik/pap-client:latest',
  port: 9000,
  portName: 'pap',
  essential: true,
  resources: {
    cpuRequest: '25m',
    memoryRequest: '64Mi', // K8s minimum is 64Mi
    cpuLimit: '100m',
    memoryLimit: '128Mi',
  },
  livenessProbe: {
    httpGet: { path: '/health', port: 9000 },
    initialDelaySeconds: 5,
    periodSeconds: 10,
  },
};

const AGENT_API_CONTAINER: ContainerSpec = {
  name: 'agent-api',
  image: 'ghcr.io/veriteknik/agent-api:latest',
  port: 8080,
  portName: 'api',
  essential: true,
  resources: {
    cpuRequest: '25m',
    memoryRequest: '64Mi', // K8s minimum is 64Mi
    cpuLimit: '100m',
    memoryLimit: '128Mi',
  },
  livenessProbe: {
    httpGet: { path: '/health', port: 8080 },
    initialDelaySeconds: 5,
    periodSeconds: 10,
  },
  readinessProbe: {
    httpGet: { path: '/health', port: 8080 },
    initialDelaySeconds: 5,
    periodSeconds: 5,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Template-Specific Containers
// ─────────────────────────────────────────────────────────────────────────────

function getOpenCodeIdeContainers(config: OpenCodeAgentConfig): ContainerSpec[] {
  return [
    // Main UI: code-server (VSCode)
    {
      name: 'code-server',
      image: 'ghcr.io/veriteknik/code-server-opencode:latest',
      port: 8443,
      portName: 'http',
      essential: false,
      idleTimeoutMinutes: 30,
      env: [
        ...COMMON_ENV(config),
        { name: 'PASSWORD', valueFrom: { secretKeyRef: { name: config.secretName, key: 'ui-password' } } },
      ],
      resources: {
        cpuRequest: '300m',
        memoryRequest: '512Mi',
        cpuLimit: '1500m',
        memoryLimit: '2Gi',
      },
      volumeMounts: [
        { name: 'workspace', mountPath: '/workspace' },
        { name: 'opencode-config', mountPath: '/home/coder/.opencode' },
      ],
      livenessProbe: {
        httpGet: { path: '/healthz', port: 8443 },
        initialDelaySeconds: 30,
        periodSeconds: 30,
        timeoutSeconds: 5,
      },
      readinessProbe: {
        httpGet: { path: '/healthz', port: 8443 },
        initialDelaySeconds: 10,
        periodSeconds: 10,
        timeoutSeconds: 5,
      },
      workingDir: '/workspace',
    },
    PAP_CLIENT_CONTAINER,
    { ...AGENT_API_CONTAINER, port: 8080, portName: 'api' },
  ];
}

function getOpenCodeChamberContainers(config: OpenCodeAgentConfig): ContainerSpec[] {
  // Each agent gets its own opencode-serve container for full tenant isolation
  return [
    // Main UI: OpenChamber (Chat)
    {
      name: 'openchamber',
      image: 'ghcr.io/veriteknik/openchamber:latest',
      port: 3000,
      portName: 'http',
      essential: false,
      idleTimeoutMinutes: 30,
      // Patch openchamber to use external OPENCODE_URL (fixes model loading with external opencode-serve)
      // This avoids rebuilding the image when upstream updates
      command: ['/bin/sh', '-c'],
      args: [`
        # Patch buildOpenCodeUrl: fix the early throw check to allow external URL
        sed -i '/^function buildOpenCodeUrl/,/^}$/s/if (!openCodePort) {/if (!openCodePort \\&\\& !ENV_CONFIGURED_OPENCODE_URL) {/' server/index.js &&
        # Patch buildOpenCodeUrl: use external URL when available
        sed -i 's|return \\\`http://localhost:\\\${openCodePort}\\\${fullPath}\\\`;|if (ENV_CONFIGURED_OPENCODE_URL) { return \\\`\\\${ENV_CONFIGURED_OPENCODE_URL}\\\${fullPath}\\\`; } return \\\`http://localhost:\\\${openCodePort}\\\${fullPath}\\\`;|' server/index.js &&
        # Patch fetchProvidersSnapshot to allow external URL
        sed -i '/^async function fetchProvidersSnapshot/,/^}$/s/if (!openCodePort) {/if (!openCodePort \\&\\& !ENV_CONFIGURED_OPENCODE_URL) {/' server/index.js &&
        # Patch fetchModelsSnapshot to allow external URL
        sed -i '/^async function fetchModelsSnapshot/,/^}$/s/if (!openCodePort) {/if (!openCodePort \\&\\& !ENV_CONFIGURED_OPENCODE_URL) {/' server/index.js &&
        # Start the server
        exec bun run server/index.js --port 3000
      `],
      env: [
        ...COMMON_ENV(config),
        // opencode-serve listens on 127.0.0.1 only. Use the IPv4 literal, not
        // `localhost` (which can resolve to ::1), and never the Service DNS:
        // the OpenCode API is unauthenticated, so it must not be published.
        { name: 'OPENCODE_URL', value: 'http://127.0.0.1:4000' },
        { name: 'OPENCHAMBER_UI_PASSWORD', valueFrom: { secretKeyRef: { name: config.secretName, key: 'ui-password' } } },
      ],
      resources: {
        cpuRequest: '100m',
        memoryRequest: '256Mi',
        cpuLimit: '500m',
        memoryLimit: '1Gi',
      },
      volumeMounts: [
        { name: 'workspace', mountPath: '/workspace' },
      ],
      livenessProbe: {
        httpGet: { path: '/', port: 3000 },
        initialDelaySeconds: 10,
        periodSeconds: 30,
      },
      readinessProbe: {
        httpGet: { path: '/', port: 3000 },
        initialDelaySeconds: 5,
        periodSeconds: 10,
      },
    },
    // OpenCode API server (per-pod for tenant isolation). It has no auth of
    // its own — openchamber in front of it does — so it is loopback-only.
    {
      name: 'opencode-serve',
      image: 'ghcr.io/veriteknik/opencode-server:latest',
      port: 4000,
      portName: 'opencode',
      essential: false,
      idleTimeoutMinutes: 30,
      loopbackOnly: true,
      env: [
        ...COMMON_ENV(config),
        { name: 'PORT', value: '4000' },
        { name: 'HOST', value: '127.0.0.1' },
      ],
      resources: {
        cpuRequest: '200m',
        memoryRequest: '512Mi',
        cpuLimit: '1000m',
        memoryLimit: '1536Mi',
      },
      volumeMounts: [
        { name: 'workspace', mountPath: '/workspace' },
        { name: 'opencode-config', mountPath: '/home/opencode/.opencode' },
      ],
      workingDir: '/workspace',
      livenessProbe: {
        exec: { command: loopbackHealthCheck('http://127.0.0.1:4000/global/health') },
        initialDelaySeconds: 15,
        periodSeconds: 30,
        timeoutSeconds: 5,
      },
      readinessProbe: {
        exec: { command: loopbackHealthCheck('http://127.0.0.1:4000/global/health') },
        initialDelaySeconds: 10,
        periodSeconds: 10,
        timeoutSeconds: 5,
      },
    },
    // Web terminal (ttyd): a writable shell with no authentication. Bound to
    // loopback (`-i lo`), so it is reachable only with `kubectl port-forward`
    // (cluster credentials) — never from another tenant's pod. It gets no Hub,
    // PAP or model-router credentials; a maintenance shell does not need them.
    {
      name: 'ttyd',
      image: 'tsl0922/ttyd:alpine',
      port: 7681,
      portName: 'terminal',
      essential: false,
      idleTimeoutMinutes: 15,
      loopbackOnly: true,
      command: ['ttyd', '-W', '-i', 'lo', '-p', '7681', 'sh'],
      env: [
        { name: 'AGENT_NAME', value: config.name },
        { name: 'AGENT_UUID', value: config.agentUuid },
        { name: 'AGENT_DOMAIN', value: config.dnsName },
      ],
      resources: {
        cpuRequest: '50m',
        memoryRequest: '64Mi',
        cpuLimit: '200m',
        memoryLimit: '256Mi',
      },
      volumeMounts: [
        { name: 'workspace', mountPath: '/workspace' },
      ],
      workingDir: '/workspace',
    },
    PAP_CLIENT_CONTAINER,
    { ...AGENT_API_CONTAINER, port: 8080, portName: 'api' },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Manifest Builders
// ─────────────────────────────────────────────────────────────────────────────

function buildPvcManifest(config: OpenCodeAgentConfig): object {
  return {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: {
      name: `${config.name}-workspace`,
      namespace: config.namespace,
      labels: resourceLabels(config),
    },
    spec: {
      accessModes: ['ReadWriteOnce'],
      resources: {
        requests: {
          storage: config.workspaceStorageSize || '10Gi',
        },
      },
      storageClassName: 'local-path', // K3s default
    },
  };
}

function buildSecretManifest(config: OpenCodeAgentConfig): object {
  // Base64 encode the values
  const encode = (s: string) => Buffer.from(s).toString('base64');

  return {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
      name: config.secretName,
      namespace: config.namespace,
      labels: resourceLabels(config),
    },
    type: 'Opaque',
    data: {
      'ui-password': encode(config.uiPassword),
      'model-router-token': encode(config.modelRouterToken),
      'pap-api-key': encode(config.papApiKey),
      'pluggedin-api-key': encode(config.pluggedinApiKey),
    },
  };
}

function buildConfigMapManifest(config: OpenCodeAgentConfig): object {
  // Generate opencode.json configuration
  const opencodeConfig = {
    $schema: 'https://opencode.ai/config.json',
    model: `pluggedin/${config.defaultModel}`,
    provider: {
      pluggedin: {
        name: 'Plugged.in Model Router',
        baseURL: `${config.modelRouterUrl}/v1`,
        apiKey: '{env:MODEL_ROUTER_TOKEN}',
        // Models are dynamically fetched from Model Router
        models: {},
      },
    },
    mcp: {
      pluggedin: {
        type: 'remote',
        url: 'https://mcp.plugged.in/mcp/sse',
        headers: {
          'Authorization': 'Bearer {env:PLUGGEDIN_API_KEY}',
          'X-Agent-ID': config.agentUuid,
        },
      },
    },
    workspace: '/workspace',
    autoupdate: false,
  };

  return {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: config.configMapName,
      namespace: config.namespace,
      labels: resourceLabels(config),
    },
    data: {
      'opencode.json': JSON.stringify(opencodeConfig, null, 2),
    },
  };
}

function buildDeploymentManifest(config: OpenCodeAgentConfig): object {
  const containers = config.templateType === 'opencode-ide'
    ? getOpenCodeIdeContainers(config)
    : getOpenCodeChamberContainers(config);

  // Build init container spec
  const initContainers: InitContainerSpec[] = [
    {
      name: 'opencode-init',
      image: 'ghcr.io/veriteknik/opencode-init:latest',
      env: [
        { name: 'AGENT_NAME', value: config.name },
        { name: 'AGENT_UUID', value: config.agentUuid },
        { name: 'MODEL_ROUTER_URL', value: config.modelRouterUrl },
        { name: 'MODEL_ROUTER_TOKEN', valueFrom: { secretKeyRef: { name: config.secretName, key: 'model-router-token' } } },
        { name: 'DEFAULT_MODEL', value: config.defaultModel },
      ],
      volumeMounts: [
        { name: 'workspace', mountPath: '/workspace' },
        { name: 'opencode-config', mountPath: '/config' },
      ],
    },
  ];

  // Build container lifecycle annotations for pap-client
  const lifecycleAnnotations: Record<string, string> = {};
  containers.forEach((c) => {
    lifecycleAnnotations[`pap.plugged.in/${c.name}.essential`] = String(c.essential);
    if (!c.essential && c.idleTimeoutMinutes) {
      lifecycleAnnotations[`pap.plugged.in/${c.name}.idleTimeout`] = `${c.idleTimeoutMinutes}m`;
    }
  });

  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: config.name,
      namespace: config.namespace,
      labels: { ...resourceLabels(config), template: config.templateType },
    },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: config.name } },
      template: {
        metadata: {
          // Owner label on the pods too: logs, events and status select pods
          // by it rather than by the reusable `app` name.
          labels: { ...resourceLabels(config), template: config.templateType },
          annotations: {
            ...lifecycleAnnotations,
            'pap.plugged.in/template': config.templateType,
          },
        },
        spec: {
          securityContext: {
            runAsNonRoot: true,
            runAsUser: 1001,
            fsGroup: 1001,
            seccompProfile: { type: 'RuntimeDefault' },
          },
          initContainers: initContainers.map((ic) => ({
            name: ic.name,
            image: ic.image,
            command: ic.command,
            args: ic.args,
            env: ic.env,
            volumeMounts: ic.volumeMounts,
            securityContext: {
              allowPrivilegeEscalation: false,
              capabilities: { drop: ['ALL'] },
            },
          })),
          containers: containers.map((c) => ({
            name: c.name,
            image: c.image,
            // A loopback-only listener is not a pod port; declaring it would suggest otherwise.
            ports: c.loopbackOnly ? undefined : [{ containerPort: c.port, name: c.portName }],
            command: c.command,
            args: c.args,
            env: c.env || COMMON_ENV(config),
            resources: {
              requests: { cpu: c.resources.cpuRequest, memory: c.resources.memoryRequest },
              limits: { cpu: c.resources.cpuLimit, memory: c.resources.memoryLimit },
            },
            volumeMounts: c.volumeMounts,
            workingDir: c.workingDir,
            livenessProbe: c.livenessProbe,
            readinessProbe: c.readinessProbe,
            securityContext: {
              allowPrivilegeEscalation: false,
              capabilities: { drop: ['ALL'] },
              readOnlyRootFilesystem: false,
            },
          })),
          volumes: [
            {
              name: 'workspace',
              persistentVolumeClaim: { claimName: `${config.name}-workspace` },
            },
            {
              name: 'opencode-config',
              emptyDir: {}, // Init container writes here, main containers read
            },
          ],
        },
      },
    },
  };
}

function buildServiceManifest(config: OpenCodeAgentConfig): object {
  const containers = config.templateType === 'opencode-ide'
    ? getOpenCodeIdeContainers(config)
    : getOpenCodeChamberContainers(config);

  // Build multi-port service. Loopback-only listeners (ttyd, opencode-serve)
  // are unauthenticated and must never be reachable from other pods.
  const ports = containers.filter((c) => !c.loopbackOnly).map((c) => ({
    name: c.portName,
    port: c.port,
    targetPort: c.port,
    protocol: 'TCP',
  }));

  // Add metrics port for agent-api
  ports.push({
    name: 'metrics',
    port: 9090,
    targetPort: 9090,
    protocol: 'TCP',
  });

  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: config.name,
      namespace: config.namespace,
      labels: resourceLabels(config),
    },
    spec: {
      selector: { app: config.name },
      ports,
      type: 'ClusterIP',
    },
  };
}

function buildMiddlewaresManifest(config: OpenCodeAgentConfig): object[] {
  // Only opencode-chamber needs strip-prefix middlewares
  if (config.templateType !== 'opencode-chamber') {
    return [];
  }

  return [
    {
      apiVersion: 'traefik.io/v1alpha1',
      kind: 'Middleware',
      metadata: {
        name: `${config.name}-strip-opencode`,
        namespace: config.namespace,
        labels: resourceLabels(config),
      },
      spec: {
        stripPrefix: {
          prefixes: ['/opencode'],
        },
      },
    },
    {
      apiVersion: 'traefik.io/v1alpha1',
      kind: 'Middleware',
      metadata: {
        name: `${config.name}-strip-code`,
        namespace: config.namespace,
        labels: resourceLabels(config),
      },
      spec: {
        stripPrefix: {
          prefixes: ['/code'],
        },
      },
    },
  ];
}

function buildCertificateManifest(config: OpenCodeAgentConfig): object {
  return {
    apiVersion: 'cert-manager.io/v1',
    kind: 'Certificate',
    metadata: {
      name: `${config.name}-tls`,
      namespace: config.namespace,
      labels: resourceLabels(config),
    },
    spec: {
      secretName: `${config.name}-tls`,
      dnsNames: [config.dnsName],
      issuerRef: {
        name: 'letsencrypt-prod',
        kind: 'ClusterIssuer',
        group: 'cert-manager.io',
      },
      usages: ['digital signature', 'key encipherment'],
    },
  };
}

function buildIngressRouteManifest(config: OpenCodeAgentConfig): object {
  let routes: object[];

  if (config.templateType === 'opencode-ide') {
    routes = [
      {
        match: `Host(\`${config.dnsName}\`) && PathPrefix(\`/api\`)`,
        kind: 'Rule',
        services: [{ name: config.name, port: 8080 }],
      },
      {
        match: `Host(\`${config.dnsName}\`) && PathPrefix(\`/health\`)`,
        kind: 'Rule',
        services: [{ name: config.name, port: 8080 }],
      },
      {
        match: `Host(\`${config.dnsName}\`) && PathPrefix(\`/metrics\`)`,
        kind: 'Rule',
        services: [{ name: config.name, port: 9090 }],
      },
      {
        match: `Host(\`${config.dnsName}\`)`,
        kind: 'Rule',
        services: [{ name: config.name, port: 8443 }],
      },
    ];
  } else {
    // opencode-chamber - routes with strip-prefix middlewares
    // /code → openchamber (AI chat interface)
    // / → openchamber (default, will be replaced by user's custom page later)
    routes = [
      {
        match: `Host(\`${config.dnsName}\`) && PathPrefix(\`/code\`)`,
        kind: 'Rule',
        services: [{ name: config.name, port: 3000 }],
        middlewares: [{ name: `${config.name}-strip-code` }],
      },
      // OpenCode is reachable only through the authenticated chamber proxy.
      // No public /terminal route. The ttyd container runs a writable shell
      // (`ttyd -W ... sh`) and this route carried a stripPrefix middleware
      // and nothing else, so reaching the host was reaching a root shell in the
      // pod, with its workspace and its service-account token.
      //
      // ttyd is still in the Deployment, bound to loopback and absent from the
      // Service, so it is reachable only with `kubectl port-forward`, which
      // requires cluster credentials. `uiPassword`
      // exists in the config and lands in the Secret, but nothing wires it to
      // Traefik, so there is no authenticated route to publish instead. Adding
      // one is a change worth making deliberately, not a way to keep an
      // unauthenticated shell on the internet in the meantime.
      {
        // /api routes go to openchamber (not agent-api) for frontend to work
        // openchamber handles auth and proxies to opencode-serve
        match: `Host(\`${config.dnsName}\`) && PathPrefix(\`/api\`)`,
        kind: 'Rule',
        services: [{ name: config.name, port: 3000 }],
      },
      {
        // /auth routes for openchamber session management
        match: `Host(\`${config.dnsName}\`) && PathPrefix(\`/auth\`)`,
        kind: 'Rule',
        services: [{ name: config.name, port: 3000 }],
      },
      {
        // /pap-api for PAP protocol (agent-api)
        match: `Host(\`${config.dnsName}\`) && PathPrefix(\`/pap-api\`)`,
        kind: 'Rule',
        services: [{ name: config.name, port: 8080 }],
      },
      {
        match: `Host(\`${config.dnsName}\`) && PathPrefix(\`/health\`)`,
        kind: 'Rule',
        services: [{ name: config.name, port: 8080 }],
      },
      {
        match: `Host(\`${config.dnsName}\`) && PathPrefix(\`/metrics\`)`,
        kind: 'Rule',
        services: [{ name: config.name, port: 9090 }],
      },
      {
        match: `Host(\`${config.dnsName}\`)`,
        kind: 'Rule',
        services: [{ name: config.name, port: 3000 }],
      },
    ];
  }

  return {
    apiVersion: 'traefik.io/v1alpha1',
    kind: 'IngressRoute',
    metadata: {
      name: config.name,
      namespace: config.namespace,
      labels: resourceLabels(config),
    },
    spec: {
      entryPoints: ['web', 'websecure'],
      routes,
      tls: {
        secretName: `${config.name}-tls`,
        domains: [{ main: config.dnsName }],
      },
    },
  };
}

/**
 * Ingress to this agent's pods only from the ingress controller and from the
 * agent's own pods. Every tenant shares the namespace, so without this any pod
 * can reach any other agent's pod IP on every port it listens on. Policies are
 * additive: selecting the pod makes everything not allowed here denied.
 * Egress is untouched (agents call the collector, Hub and model router).
 */
function buildNetworkPolicyManifest(config: OpenCodeAgentConfig): object {
  const ingressNamespace = config.ingressControllerNamespace || DEFAULT_INGRESS_CONTROLLER_NAMESPACE;

  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: {
      name: `${config.name}-netpol`,
      namespace: config.namespace,
      labels: resourceLabels(config),
    },
    spec: {
      podSelector: { matchLabels: { app: config.name } },
      policyTypes: ['Ingress'],
      ingress: [
        {
          from: [
            { namespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': ingressNamespace } } },
            { podSelector: { matchLabels: { app: config.name } } },
          ],
        },
      ],
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface OpenCodeManifests {
  pvc: object;
  secret: object;
  configMap: object;
  deployment: object;
  service: object;
  middlewares: object[];
  certificate: object;
  ingressRoute: object;
  // Must be applied to POST /apis/networking.k8s.io/v1/namespaces/{ns}/networkpolicies
  // and removed with the agent (`${name}-netpol`).
  networkPolicy: object;
}

/**
 * Generate all Kubernetes manifests for an OpenCode agent.
 */
export function buildOpenCodeManifests(config: OpenCodeAgentConfig): OpenCodeManifests {
  return {
    pvc: buildPvcManifest(config),
    secret: buildSecretManifest(config),
    configMap: buildConfigMapManifest(config),
    deployment: buildDeploymentManifest(config),
    service: buildServiceManifest(config),
    middlewares: buildMiddlewaresManifest(config),
    certificate: buildCertificateManifest(config),
    ingressRoute: buildIngressRouteManifest(config),
    networkPolicy: buildNetworkPolicyManifest(config),
  };
}

/**
 * Containers whose listener is loopback-only (unauthenticated, never on the
 * Service), with their ports. The isolation migration for agents deployed
 * before this existed uses it to know which Service ports and routes to drop
 * and which containers to rebind (scripts/migrate-opencode-agent-isolation.ts).
 */
export function getLoopbackOnlyContainers(config: OpenCodeAgentConfig): Array<{ name: string; port: number }> {
  const containers = config.templateType === 'opencode-ide'
    ? getOpenCodeIdeContainers(config)
    : getOpenCodeChamberContainers(config);
  return containers.filter((c) => c.loopbackOnly).map((c) => ({ name: c.name, port: c.port }));
}

/**
 * Get container configuration for a template type.
 * Used by pap-client for lifecycle management.
 */
export function getContainerConfig(templateType: 'opencode-ide' | 'opencode-chamber'): Record<string, { essential: boolean; idleTimeout?: string }> {
  const config = {
    'opencode-ide': {
      'code-server': { essential: false, idleTimeout: '30m' },
      'pap-client': { essential: true },
      'agent-api': { essential: true },
    },
    'opencode-chamber': {
      'openchamber': { essential: false, idleTimeout: '30m' },
      'opencode-serve': { essential: false, idleTimeout: '30m' },
      'ttyd': { essential: false, idleTimeout: '15m' },
      'pap-client': { essential: true },
      'agent-api': { essential: true },
    },
  };
  return config[templateType];
}

/**
 * Get estimated resource requirements for a template.
 */
export function getResourceEstimates(templateType: 'opencode-ide' | 'opencode-chamber'): {
  active: { cpu: string; memory: string };
  idle: { cpu: string; memory: string };
  sleep: { cpu: string; memory: string };
} {
  if (templateType === 'opencode-ide') {
    return {
      active: { cpu: '350m', memory: '1Gi' },
      idle: { cpu: '200m', memory: '512Mi' },
      sleep: { cpu: '50m', memory: '64Mi' },
    };
  }
  // opencode-chamber with per-pod opencode-serve for tenant isolation
  return {
    active: { cpu: '450m', memory: '1.5Gi' },
    idle: { cpu: '250m', memory: '768Mi' },
    sleep: { cpu: '50m', memory: '64Mi' },
  };
}
