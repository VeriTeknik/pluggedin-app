/**
 * OpenCode Template Manifest Builder
 *
 * Generates Kubernetes manifests for multi-container OpenCode agent pods.
 * Supports two templates:
 * - opencode-ide: VSCode + OpenCode terminal integration
 * - opencode-chamber: Chat UI + OpenCode serve API
 *
 * Both templates include essential containers (pap-client, agent-api) that
 * never shut down, and non-essential containers that scale down on idle.
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

export interface IngressPath {
  path: string;
  pathType: 'Prefix' | 'Exact';
  serviceName: string;
  servicePort: number;
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
  modelRouterToken: string;
  papApiKey: string;
  pluggedinApiKey: string;

  // Optional overrides
  workspaceStorageSize?: string; // e.g., '10Gi'
}

// ─────────────────────────────────────────────────────────────────────────────
// Container Configurations
// ─────────────────────────────────────────────────────────────────────────────

const COMMON_ENV = (config: OpenCodeAgentConfig): Array<{ name: string; value?: string; valueFrom?: object }> => [
  { name: 'AGENT_NAME', value: config.name },
  { name: 'AGENT_UUID', value: config.agentUuid },
  { name: 'AGENT_DOMAIN', value: config.dnsName },
  { name: 'PAP_STATION_URL', value: 'https://plugged.in' },
  { name: 'PAP_API_KEY', valueFrom: { secretKeyRef: { name: config.secretName, key: 'pap-api-key' } } },
  { name: 'MODEL_ROUTER_URL', value: 'https://models.plugged.in' },
  { name: 'MODEL_ROUTER_TOKEN', valueFrom: { secretKeyRef: { name: config.secretName, key: 'model-router-token' } } },
  { name: 'PLUGGEDIN_API_KEY', valueFrom: { secretKeyRef: { name: config.secretName, key: 'pluggedin-api-key' } } },
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
        { name: 'opencode-config', mountPath: '/home/coder/.opencode', readOnly: true },
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
  return [
    // Main UI: OpenChamber (Chat)
    {
      name: 'openchamber',
      image: 'ghcr.io/veriteknik/openchamber:latest',
      port: 3000,
      portName: 'http',
      essential: false,
      idleTimeoutMinutes: 30,
      env: [
        ...COMMON_ENV(config),
        { name: 'OPENCODE_PORT', value: '4000' }, // Connects to opencode-serve
        { name: 'UI_PASSWORD', valueFrom: { secretKeyRef: { name: config.secretName, key: 'ui-password' } } },
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
    // OpenCode serve API backend
    {
      name: 'opencode-serve',
      image: 'ghcr.io/veriteknik/opencode-server:latest',
      port: 4000,
      portName: 'opencode',
      essential: false,
      idleTimeoutMinutes: 30,
      env: [
        ...COMMON_ENV(config),
      ],
      resources: {
        cpuRequest: '200m',
        memoryRequest: '512Mi',
        cpuLimit: '1000m',
        memoryLimit: '1536Mi',
      },
      volumeMounts: [
        { name: 'workspace', mountPath: '/workspace' },
        { name: 'opencode-config', mountPath: '/app/.opencode', readOnly: true },
      ],
      livenessProbe: {
        httpGet: { path: '/global/health', port: 4000 },
        initialDelaySeconds: 15,
        periodSeconds: 30,
      },
      readinessProbe: {
        httpGet: { path: '/global/health', port: 4000 },
        initialDelaySeconds: 10,
        periodSeconds: 10,
      },
      workingDir: '/workspace',
    },
    // Web terminal (ttyd)
    {
      name: 'ttyd',
      image: 'tsl0922/ttyd:alpine',
      port: 7681,
      portName: 'terminal',
      essential: false,
      idleTimeoutMinutes: 15,
      command: ['ttyd', '-W', '-p', '7681', 'sh'],
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
      labels: { app: config.name, 'pap-agent': 'true' },
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
      labels: { app: config.name, 'pap-agent': 'true' },
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
        baseURL: 'https://models.plugged.in/v1',
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
      labels: { app: config.name, 'pap-agent': 'true' },
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
        { name: 'MODEL_ROUTER_URL', value: 'https://models.plugged.in' },
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
      labels: { app: config.name, 'pap-agent': 'true', template: config.templateType },
    },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: config.name } },
      template: {
        metadata: {
          labels: { app: config.name, 'pap-agent': 'true', template: config.templateType },
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
            ports: [{ containerPort: c.port, name: c.portName }],
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

  // Build multi-port service
  const ports = containers.map((c) => ({
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
      labels: { app: config.name, 'pap-agent': 'true' },
    },
    spec: {
      selector: { app: config.name },
      ports,
      type: 'ClusterIP',
    },
  };
}

function buildIngressManifest(config: OpenCodeAgentConfig): object {
  let paths: IngressPath[];

  if (config.templateType === 'opencode-ide') {
    paths = [
      { path: '/api', pathType: 'Prefix', serviceName: config.name, servicePort: 8080 },
      { path: '/health', pathType: 'Prefix', serviceName: config.name, servicePort: 8080 },
      { path: '/metrics', pathType: 'Prefix', serviceName: config.name, servicePort: 9090 },
      { path: '/', pathType: 'Prefix', serviceName: config.name, servicePort: 8443 },
    ];
  } else {
    // opencode-chamber
    paths = [
      { path: '/terminal', pathType: 'Prefix', serviceName: config.name, servicePort: 7681 },
      { path: '/opencode', pathType: 'Prefix', serviceName: config.name, servicePort: 4000 },
      { path: '/api', pathType: 'Prefix', serviceName: config.name, servicePort: 8080 },
      { path: '/health', pathType: 'Prefix', serviceName: config.name, servicePort: 8080 },
      { path: '/metrics', pathType: 'Prefix', serviceName: config.name, servicePort: 9090 },
      { path: '/', pathType: 'Prefix', serviceName: config.name, servicePort: 3000 },
    ];
  }

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
        // WebSocket support for terminal and OpenCode
        'traefik.ingress.kubernetes.io/router.middlewares': '',
      },
    },
    spec: {
      ingressClassName: 'traefik',
      tls: [{ hosts: [config.dnsName], secretName: `${config.name}-tls` }],
      rules: [
        {
          host: config.dnsName,
          http: {
            paths: paths.map((p) => ({
              path: p.path,
              pathType: p.pathType,
              backend: {
                service: {
                  name: p.serviceName,
                  port: { number: p.servicePort },
                },
              },
            })),
          },
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
  ingress: object;
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
    ingress: buildIngressManifest(config),
  };
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
  return {
    active: { cpu: '450m', memory: '1.5Gi' },
    idle: { cpu: '250m', memory: '768Mi' },
    sleep: { cpu: '50m', memory: '64Mi' },
  };
}
