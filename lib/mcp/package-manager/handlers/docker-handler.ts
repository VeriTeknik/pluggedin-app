import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { BasePackageHandler, InstallOptions, PackageInfo } from './base-handler';
import { PackageManagerConfig } from '../config';

const execAsync = promisify(exec);

export class DockerHandler extends BasePackageHandler {
  protected packageManagerName = 'docker';
  
  async install(options: InstallOptions): Promise<PackageInfo> {
    const { serverUuid, packageName, version } = options;
    
    this.log('Installing Docker container', { serverUuid, packageName, version });
    
    const installDir = this.getServerInstallDir(serverUuid);
    await this.ensureDirectory(installDir);
    
    // For Docker, we don't actually "install" the container here
    // We just pull it and return the docker run command
    const containerTag = version ? `${packageName}:${version}` : packageName;
    
    try {
      // Pull the Docker image
      const pullCommand = `docker pull ${containerTag}`;
      this.log('Pulling Docker image', { command: pullCommand });
      
      await execAsync(pullCommand, {
        timeout: PackageManagerConfig.PROCESS_TIMEOUT_MS,
        env: {
          ...process.env,
          ...options.env,
        },
      });
      
      this.log('Docker image pulled successfully', { containerTag });
      
      // Create a wrapper script that runs the container
      const wrapperScript = this.createDockerWrapper(serverUuid, containerTag);
      
      return {
        name: packageName,
        version: version || 'latest',
        binaryPath: wrapperScript,
        installPath: installDir,
      };
    } catch (error) {
      this.log('Docker pull failed', { error: error instanceof Error ? error.message : String(error) });
      throw new Error(`Failed to pull Docker image ${containerTag}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  async isInstalled(serverUuid: string, packageName: string): Promise<boolean> {
    try {
      // Check if the Docker image exists locally
      const { stdout } = await execAsync(`docker images -q ${packageName}`, {
        timeout: 5000, // Quick check
      });
      
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }
  
  async getBinaryPath(serverUuid: string, packageName: string): Promise<string | null> {
    if (await this.isInstalled(serverUuid, packageName)) {
      return this.createDockerWrapper(serverUuid, packageName);
    }
    return null;
  }
  
  async cleanup(serverUuid: string): Promise<void> {
    this.log('Cleaning up Docker containers', { serverUuid });
    
    try {
      // Remove any containers that were created for this server
      const containerName = `mcp-${serverUuid}`;
      await execAsync(`docker rm -f ${containerName}`, {
        timeout: 10000,
      });
    } catch (error) {
      // Container might not exist, which is fine
      this.log('Docker cleanup completed', { serverUuid, note: 'Container may not have existed' });
    }
    
    // Clean up wrapper scripts
    const installDir = this.getServerInstallDir(serverUuid);
    try {
      const fs = await import('fs');
      await fs.promises.rm(installDir, { recursive: true, force: true });
    } catch (error) {
      this.log('Failed to clean up install directory', { error: error instanceof Error ? error.message : String(error) });
    }
  }
  
  async getDiskUsage(serverUuid: string): Promise<number> {
    // For Docker, we estimate based on container images
    // This is approximate since Docker images are shared across containers
    try {
      const { stdout } = await execAsync('docker images --format "table {{.Size}}"', {
        timeout: 5000,
      });
      
      // Parse the output to get total size (rough estimate)
      const lines = stdout.trim().split('\n').slice(1); // Skip header
      let totalSize = 0;
      
      for (const line of lines) {
        const sizeStr = line.trim();
        if (sizeStr.includes('MB')) {
          totalSize += parseFloat(sizeStr.replace('MB', '')) * 1024 * 1024;
        } else if (sizeStr.includes('GB')) {
          totalSize += parseFloat(sizeStr.replace('GB', '')) * 1024 * 1024 * 1024;
        }
      }
      
      return Math.round(totalSize / 1024 / 1024); // Return in MB
    } catch {
      return 0;
    }
  }
  
  async prewarmPackages(packages: string[]): Promise<void> {
    this.log('Pre-warming Docker images', { packages });
    
    for (const packageName of packages) {
      try {
        await execAsync(`docker pull ${packageName}`, {
          timeout: PackageManagerConfig.PROCESS_TIMEOUT_MS,
        });
        this.log('Pre-warmed Docker image', { packageName });
      } catch (error) {
        this.log('Failed to pre-warm Docker image', { 
          packageName, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }
  }
  
  private createDockerWrapper(serverUuid: string, containerTag: string): string {
    const installDir = this.getServerInstallDir(serverUuid);
    const wrapperPath = path.join(installDir, 'docker-wrapper.sh');
    
    // Create a shell script that runs the Docker container
    const wrapperContent = `#!/bin/bash
# Docker wrapper for MCP server ${serverUuid}
# Container: ${containerTag}

CONTAINER_NAME="mcp-${serverUuid}"

# Remove existing container if it exists
docker rm -f "\${CONTAINER_NAME}" 2>/dev/null || true

# Run the container with appropriate settings
exec docker run --rm \\
  --name "\${CONTAINER_NAME}" \\
  --user "\$(id -u):\$(id -g)" \\
  --network none \\
  --read-only \\
  --tmpfs /tmp \\
  --tmpfs /var/tmp \\
  --cap-drop ALL \\
  --security-opt no-new-privileges \\
  "${containerTag}" \\
  "\$@"
`;
    
    // Write the wrapper script
    const fs = require('fs');
    fs.writeFileSync(wrapperPath, wrapperContent, { mode: 0o755 });
    
    return wrapperPath;
  }
}