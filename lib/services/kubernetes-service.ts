/**
 * Kubernetes Service for PAP Agent Management
 *
 * Handles deployment, monitoring, and lifecycle management of PAP agents
 * in the K3s cluster on is.plugged.in via Rancher API
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Rancher API configuration
const RANCHER_URL = process.env.RANCHER_URL || 'https://rancher.is.plugged.in';
const RANCHER_ACCESS_KEY = process.env.RANCHER_ACCESS_KEY || '';
const RANCHER_SECRET_KEY = process.env.RANCHER_SECRET_KEY || '';
const RANCHER_CLUSTER_ID = process.env.RANCHER_CLUSTER_ID || 'local';

// Create basic auth header for Rancher API
const authHeader = 'Basic ' + Buffer.from(`${RANCHER_ACCESS_KEY}:${RANCHER_SECRET_KEY}`).toString('base64');

// Helper function to make Rancher API requests
async function rancherRequest(path: string, options: RequestInit = {}): Promise<any> {
  const url = `${RANCHER_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Rancher API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

export interface AgentDeploymentConfig {
  name: string; // DNS-safe agent name (e.g., 'focus', 'memory')
  dnsName: string; // Full DNS: {name}.{cluster}.a.plugged.in
  namespace?: string; // Kubernetes namespace (default: 'agents')
  image?: string; // Container image (default: nginx-unprivileged for testing)
  resources?: {
    cpuRequest?: string; // e.g., '100m'
    memoryRequest?: string; // e.g., '256Mi'
    cpuLimit?: string; // e.g., '1000m'
    memoryLimit?: string; // e.g., '1Gi'
  };
}

export interface DeploymentStatus {
  ready: boolean;
  replicas: number;
  readyReplicas: number;
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
  private readonly clusterDomain = 'is.plugged.in';

  /**
   * Generate Kubernetes deployment YAML for a PAP agent
   */
  private generateDeploymentYAML(config: AgentDeploymentConfig): string {
    const namespace = config.namespace || this.defaultNamespace;
    const image = config.image || this.defaultImage;
    const resources = config.resources || {
      cpuRequest: '100m',
      memoryRequest: '256Mi',
      cpuLimit: '1000m',
      memoryLimit: '1Gi',
    };

    return `---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${config.name}
  namespace: ${namespace}
  labels:
    app: ${config.name}
    pap-agent: "true"
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${config.name}
  template:
    metadata:
      labels:
        app: ${config.name}
        pap-agent: "true"
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
      containers:
      - name: agent
        image: ${image}
        ports:
        - containerPort: 8080
          name: http
        resources:
          requests:
            cpu: ${resources.cpuRequest}
            memory: ${resources.memoryRequest}
          limits:
            cpu: ${resources.cpuLimit}
            memory: ${resources.memoryLimit}
        securityContext:
          allowPrivilegeEscalation: false
          capabilities:
            drop:
            - ALL
          readOnlyRootFilesystem: false
---
apiVersion: v1
kind: Service
metadata:
  name: ${config.name}
  namespace: ${namespace}
  labels:
    app: ${config.name}
    pap-agent: "true"
spec:
  selector:
    app: ${config.name}
  ports:
  - port: 80
    targetPort: 8080
    protocol: TCP
    name: http
  type: ClusterIP
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${config.name}
  namespace: ${namespace}
  labels:
    app: ${config.name}
    pap-agent: "true"
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    traefik.ingress.kubernetes.io/router.entrypoints: websecure
spec:
  ingressClassName: traefik
  tls:
  - hosts:
    - ${config.dnsName}
    secretName: ${config.name}-tls
  rules:
  - host: ${config.dnsName}
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: ${config.name}
            port:
              number: 80
`;
  }

  /**
   * Deploy a new PAP agent to Kubernetes via Rancher API
   */
  async deployAgent(config: AgentDeploymentConfig): Promise<{ success: boolean; message: string; deploymentName: string }> {
    try {
      const namespace = config.namespace || this.defaultNamespace;
      const image = config.image || this.defaultImage;
      const resources = config.resources || {
        cpuRequest: '100m',
        memoryRequest: '256Mi',
        cpuLimit: '1000m',
        memoryLimit: '1Gi',
      };

      const basePath = `/k8s/clusters/${RANCHER_CLUSTER_ID}`;

      // Create Deployment
      const deployment = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: config.name,
          namespace,
          labels: {
            app: config.name,
            'pap-agent': 'true',
          },
        },
        spec: {
          replicas: 1,
          selector: {
            matchLabels: {
              app: config.name,
            },
          },
          template: {
            metadata: {
              labels: {
                app: config.name,
                'pap-agent': 'true',
              },
            },
            spec: {
              securityContext: {
                runAsNonRoot: true,
                runAsUser: 1001,
                fsGroup: 1001,
              },
              containers: [
                {
                  name: 'agent',
                  image,
                  ports: [{ containerPort: 8080, name: 'http' }],
                  resources: {
                    requests: {
                      cpu: resources.cpuRequest,
                      memory: resources.memoryRequest,
                    },
                    limits: {
                      cpu: resources.cpuLimit,
                      memory: resources.memoryLimit,
                    },
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

      await rancherRequest(`${basePath}/apis/apps/v1/namespaces/${namespace}/deployments`, {
        method: 'POST',
        body: JSON.stringify(deployment),
      });

      // Create Service
      const service = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name: config.name,
          namespace,
          labels: {
            app: config.name,
            'pap-agent': 'true',
          },
        },
        spec: {
          selector: {
            app: config.name,
          },
          ports: [
            {
              port: 80,
              targetPort: 8080,
              protocol: 'TCP',
              name: 'http',
            },
          ],
          type: 'ClusterIP',
        },
      };

      await rancherRequest(`${basePath}/v1/namespaces/${namespace}/services`, {
        method: 'POST',
        body: JSON.stringify(service),
      });

      // Create Ingress
      const ingress = {
        apiVersion: 'networking.k8s.io/v1',
        kind: 'Ingress',
        metadata: {
          name: config.name,
          namespace,
          labels: {
            app: config.name,
            'pap-agent': 'true',
          },
          annotations: {
            'cert-manager.io/cluster-issuer': 'letsencrypt-prod',
            'traefik.ingress.kubernetes.io/router.entrypoints': 'websecure',
          },
        },
        spec: {
          ingressClassName: 'traefik',
          tls: [
            {
              hosts: [config.dnsName],
              secretName: `${config.name}-tls`,
            },
          ],
          rules: [
            {
              host: config.dnsName,
              http: {
                paths: [
                  {
                    path: '/',
                    pathType: 'Prefix',
                    backend: {
                      service: {
                        name: config.name,
                        port: { number: 80 },
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      await rancherRequest(`${basePath}/apis/networking.k8s.io/v1/namespaces/${namespace}/ingresses`, {
        method: 'POST',
        body: JSON.stringify(ingress),
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
   * Get deployment status for an agent via Rancher API
   */
  async getDeploymentStatus(name: string, namespace?: string): Promise<DeploymentStatus | null> {
    try {
      const ns = namespace || this.defaultNamespace;
      const basePath = `/k8s/clusters/${RANCHER_CLUSTER_ID}`;

      const deployment = await rancherRequest(
        `${basePath}/apis/apps/v1/namespaces/${ns}/deployments/${name}`
      );

      const status = deployment.status || {};

      return {
        ready: (status.readyReplicas || 0) === (status.replicas || 0),
        replicas: status.replicas || 0,
        readyReplicas: status.readyReplicas || 0,
        unavailableReplicas: status.unavailableReplicas,
        conditions: status.conditions || [],
      };
    } catch (error) {
      // Deployment doesn't exist or error occurred
      return null;
    }
  }

  /**
   * Check if an agent deployment exists
   */
  async deploymentExists(name: string, namespace?: string): Promise<boolean> {
    try {
      const ns = namespace || this.defaultNamespace;
      await execAsync(`kubectl get deployment ${name} -n ${ns}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete an agent deployment and all related resources via Rancher API
   */
  async deleteAgent(name: string, namespace?: string): Promise<{ success: boolean; message: string }> {
    try {
      const ns = namespace || this.defaultNamespace;
      const basePath = `/k8s/clusters/${RANCHER_CLUSTER_ID}`;

      // Delete deployment
      try {
        await rancherRequest(`${basePath}/apis/apps/v1/namespaces/${ns}/deployments/${name}`, {
          method: 'DELETE',
        });
      } catch (error) {
        console.warn(`Warning: Could not delete deployment ${name}:`, error);
      }

      // Delete service
      try {
        await rancherRequest(`${basePath}/v1/namespaces/${ns}/services/${name}`, {
          method: 'DELETE',
        });
      } catch (error) {
        console.warn(`Warning: Could not delete service ${name}:`, error);
      }

      // Delete ingress
      try {
        await rancherRequest(`${basePath}/apis/networking.k8s.io/v1/namespaces/${ns}/ingresses/${name}`, {
          method: 'DELETE',
        });
      } catch (error) {
        console.warn(`Warning: Could not delete ingress ${name}:`, error);
      }

      // Delete TLS secret
      try {
        await rancherRequest(`${basePath}/v1/namespaces/${ns}/secrets/${name}-tls`, {
          method: 'DELETE',
        });
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
   * List all PAP agent deployments
   */
  async listAgents(namespace?: string): Promise<Array<{ name: string; ready: boolean }>> {
    try {
      const ns = namespace || this.defaultNamespace;
      const { stdout } = await execAsync(
        `kubectl get deployments -n ${ns} -l pap-agent=true -o json`
      );

      const result = JSON.parse(stdout);
      const deployments = result.items || [];

      return deployments.map((deployment: any) => ({
        name: deployment.metadata.name,
        ready: (deployment.status?.readyReplicas || 0) === (deployment.status?.replicas || 0),
      }));
    } catch (error) {
      console.error('Error listing agents:', error);
      return [];
    }
  }

  /**
   * Scale an agent deployment
   */
  async scaleAgent(name: string, replicas: number, namespace?: string): Promise<{ success: boolean; message: string }> {
    try {
      const ns = namespace || this.defaultNamespace;
      await execAsync(`kubectl scale deployment ${name} -n ${ns} --replicas=${replicas}`);

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
   * Get logs from an agent pod
   */
  async getAgentLogs(name: string, namespace?: string, tailLines: number = 100): Promise<string | null> {
    try {
      const ns = namespace || this.defaultNamespace;
      const { stdout } = await execAsync(
        `kubectl logs deployment/${name} -n ${ns} --tail=${tailLines} --timestamps`
      );
      return stdout;
    } catch (error) {
      console.error('Error getting agent logs:', error);
      return null;
    }
  }

  /**
   * Upgrade an agent with new image and/or resources using rolling update
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

      // Update deployment image
      await execAsync(
        `kubectl set image deployment/${config.name} -n ${ns} agent=${config.image}`
      );

      // Update resources if provided
      if (config.resources) {
        const resourcesArgs = [];
        if (config.resources.cpu_request || config.resources.memory_request) {
          const requests = [
            config.resources.cpu_request ? `cpu=${config.resources.cpu_request}` : '',
            config.resources.memory_request ? `memory=${config.resources.memory_request}` : '',
          ]
            .filter(Boolean)
            .join(',');
          if (requests) resourcesArgs.push(`--requests=${requests}`);
        }
        if (config.resources.cpu_limit || config.resources.memory_limit) {
          const limits = [
            config.resources.cpu_limit ? `cpu=${config.resources.cpu_limit}` : '',
            config.resources.memory_limit ? `memory=${config.resources.memory_limit}` : '',
          ]
            .filter(Boolean)
            .join(',');
          if (limits) resourcesArgs.push(`--limits=${limits}`);
        }

        if (resourcesArgs.length > 0) {
          await execAsync(
            `kubectl set resources deployment/${config.name} -n ${ns} -c=agent ${resourcesArgs.join(' ')}`
          );
        }
      }

      // Update strategy if provided
      if (config.strategy?.type === 'RollingUpdate' && config.strategy.rollingUpdate) {
        const { maxSurge, maxUnavailable } = config.strategy.rollingUpdate;
        const patchJson = {
          spec: {
            strategy: {
              type: 'RollingUpdate',
              rollingUpdate: {
                ...(maxSurge !== undefined && { maxSurge }),
                ...(maxUnavailable !== undefined && { maxUnavailable }),
              },
            },
          },
        };
        await execAsync(
          `kubectl patch deployment ${config.name} -n ${ns} -p '${JSON.stringify(patchJson)}'`
        );
      }

      // Wait for rollout to complete (with timeout)
      await execAsync(
        `kubectl rollout status deployment/${config.name} -n ${ns} --timeout=300s`
      );

      return {
        success: true,
        message: `Agent ${config.name} upgraded successfully to ${config.image}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Attempt rollback on failure
      try {
        const ns = config.namespace || this.defaultNamespace;
        await execAsync(`kubectl rollout undo deployment/${config.name} -n ${ns}`);

        return {
          success: false,
          message: `Upgrade failed: ${errorMessage}. Rolled back to previous version.`,
        };
      } catch (rollbackError) {
        return {
          success: false,
          message: `Upgrade failed: ${errorMessage}. Rollback also failed: ${rollbackError}`,
        };
      }
    }
  }
}

// Export singleton instance
export const kubernetesService = new KubernetesService();
