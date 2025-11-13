/**
 * Kubernetes Service for PAP Agent Management
 *
 * Handles deployment, monitoring, and lifecycle management of PAP agents
 * in the K3s cluster on is.plugged.in
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
   * Deploy a new PAP agent to Kubernetes
   */
  async deployAgent(config: AgentDeploymentConfig): Promise<{ success: boolean; message: string; deploymentName: string }> {
    try {
      const namespace = config.namespace || this.defaultNamespace;
      const yaml = this.generateDeploymentYAML(config);

      // Write YAML to temp file
      const tempFile = `/tmp/agent-${config.name}-${Date.now()}.yaml`;
      const fs = await import('fs/promises');
      await fs.writeFile(tempFile, yaml);

      // Apply the deployment
      const { stdout, stderr } = await execAsync(`kubectl apply -f ${tempFile}`);

      // Clean up temp file
      await fs.unlink(tempFile);

      if (stderr && !stderr.includes('configured') && !stderr.includes('created') && !stderr.includes('unchanged')) {
        throw new Error(stderr);
      }

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
   * Get deployment status for an agent
   */
  async getDeploymentStatus(name: string, namespace?: string): Promise<DeploymentStatus | null> {
    try {
      const ns = namespace || this.defaultNamespace;
      const { stdout } = await execAsync(
        `kubectl get deployment ${name} -n ${ns} -o json`
      );

      const deployment = JSON.parse(stdout);
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
   * Delete an agent deployment and all related resources
   */
  async deleteAgent(name: string, namespace?: string): Promise<{ success: boolean; message: string }> {
    try {
      const ns = namespace || this.defaultNamespace;

      // Delete deployment, service, and ingress
      const resources = ['deployment', 'service', 'ingress'];

      for (const resource of resources) {
        try {
          await execAsync(`kubectl delete ${resource} ${name} -n ${ns} --ignore-not-found=true`);
        } catch (error) {
          // Continue even if resource doesn't exist
          console.warn(`Warning: Could not delete ${resource} ${name}:`, error);
        }
      }

      // Also delete the TLS secret
      try {
        await execAsync(`kubectl delete secret ${name}-tls -n ${ns} --ignore-not-found=true`);
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
}

// Export singleton instance
export const kubernetesService = new KubernetesService();
