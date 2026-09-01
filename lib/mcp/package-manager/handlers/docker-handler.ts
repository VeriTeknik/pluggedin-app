import { execFile } from 'child_process';
import fs from 'fs';
import { promisify } from 'util';

import { buildSecurePath } from '@/lib/secure-path-builder';
import { validatePackageName, validatePackageVersion } from '@/lib/security/package-name';

import { PackageManagerConfig } from '../config';
import { BasePackageHandler, InstallOptions, PackageInfo } from './base-handler';

// argv execution, never a shell: the package name and version come out of a
// user-supplied args array, so a shell here is a command-injection sink.
const execFileAsync = promisify(execFile);

export class DockerHandler extends BasePackageHandler {
  protected packageManagerName = 'docker';
  
  async install(options: InstallOptions): Promise<PackageInfo> {
    const { serverUuid, packageName, version } = options;

    // The name and version come out of a user-supplied args array. argv
    // execution above already keeps them away from a shell; this keeps a
    // malformed value out of the filesystem-path builders too, and fails the
    // install before anything is spawned.
    const nameCheck = validatePackageName(packageName);
    if (!nameCheck.valid) {
      throw new Error(`Invalid package name: ${nameCheck.error}`);
    }
    if (version !== undefined) {
      const versionCheck = validatePackageVersion(version);
      if (!versionCheck.valid) {
        throw new Error(`Invalid package version: ${versionCheck.error}`);
      }
    }
    
    this.log('Installing Docker container', { serverUuid, packageName, version });
    
    const installDir = this.getServerInstallDir(serverUuid);
    await this.ensureDirectory(installDir);
    
    // For Docker, we don't actually "install" the container here
    // We just pull it and return the docker run command
    const containerTag = version ? `${packageName}:${version}` : packageName;
    
    try {
      // Pull the Docker image
      this.log('Pulling Docker image', { containerTag });
      
      await execFileAsync('docker', ['pull', containerTag], {
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
      const { stdout } = await execFileAsync('docker', ['images', '-q', packageName], {
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
      await execFileAsync('docker', ['rm', '-f', containerName], {
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
      const { stdout } = await execFileAsync('docker', ['images', '--format', 'table {{.Size}}'], {
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
        await execFileAsync('docker', ['pull', packageName], {
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
    const wrapperPath = buildSecurePath(installDir, 'docker-wrapper.sh');
    
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
    fs.writeFileSync(wrapperPath, wrapperContent, { mode: 0o755 });

    return wrapperPath;
  }
}