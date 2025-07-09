import { PackageManagerConfig } from './config';
import { BasePackageHandler, InstallOptions, PackageInfo } from './handlers/base-handler';
import { DockerHandler } from './handlers/docker-handler';
import { PnpmHandler } from './handlers/pnpm-handler';
import { UvHandler } from './handlers/uv-handler';

export { PackageManagerConfig } from './config';
export { BasePackageHandler } from './handlers/base-handler';
export type { InstallOptions, PackageInfo } from './handlers/base-handler';
export { PnpmHandler } from './handlers/pnpm-handler';
export { UvHandler } from './handlers/uv-handler';
export { DockerHandler } from './handlers/docker-handler';

export type PackageManagerType = 'npm' | 'pnpm' | 'uv' | 'uvx' | 'pip' | 'docker';

export class PackageManager {
  private handlers: Map<PackageManagerType, BasePackageHandler> = new Map();
  
  constructor() {
    // Initialize handlers
    this.handlers.set('npm', new PnpmHandler());  // Use pnpm for npm/npx commands
    this.handlers.set('pnpm', new PnpmHandler());
    this.handlers.set('uv', new UvHandler());
    this.handlers.set('uvx', new UvHandler());
    this.handlers.set('pip', new UvHandler());    // Use uv for pip commands
    this.handlers.set('docker', new DockerHandler());
  }
  
  /**
   * Detect package manager from command
   */
  static detectPackageManager(command: string): PackageManagerType | null {
    const lowerCommand = command.toLowerCase();
    
    if (lowerCommand === 'npx' || lowerCommand === 'npm') {
      return 'npm';
    }
    if (lowerCommand === 'pnpm' || lowerCommand === 'pnpx') {
      return 'pnpm';
    }
    if (lowerCommand === 'uvx') {
      return 'uvx';
    }
    if (lowerCommand === 'uv') {
      return 'uv';
    }
    if (lowerCommand === 'pip' || lowerCommand === 'pip3') {
      return 'pip';
    }
    if (lowerCommand === 'docker') {
      return 'docker';
    }
    
    return null;
  }
  
  /**
   * Get handler for package manager type
   */
  getHandler(type: PackageManagerType): BasePackageHandler | null {
    return this.handlers.get(type) || null;
  }
  
  /**
   * Install a package and return execution info
   */
  async installPackage(
    type: PackageManagerType,
    options: InstallOptions
  ): Promise<PackageInfo> {
    const handler = this.getHandler(type);
    if (!handler) {
      throw new Error(`Unsupported package manager: ${type}`);
    }
    
    return handler.install(options);
  }
  
  /**
   * Transform command to use installed package
   */
  async transformCommand(
    command: string,
    args: string[],
    serverUuid: string
  ): Promise<{ command: string; args: string[]; env?: Record<string, string> }> {
    // Special case: handle 'node <package-name>' as if it were 'npx <package-name>'
    if (command.toLowerCase() === 'node' && args.length > 0) {
      const firstArg = args[0];
      // Check if it looks like a package name (not a path)
      if (!firstArg.includes('/') && !firstArg.includes('\\') && !firstArg.startsWith('.')) {
        console.log(`[PackageManager] Detected 'node ${firstArg}' - treating as npm package`);
        
        // Transform to npx-style handling
        const handler = this.getHandler('npm');
        if (handler) {
          try {
            // Check if already installed
            const existingBinary = await handler.getBinaryPath(serverUuid, firstArg);
            if (existingBinary) {
              console.log(`[PackageManager] Using cached package: ${firstArg}`);
              return { 
                command: 'node',
                args: [existingBinary, ...args.slice(1)],
                env: this.getEnvironmentForType('npm', serverUuid)
              };
            }
            
            // Install package
            console.log(`[PackageManager] Installing package: ${firstArg}`);
            const packageInfo = await this.installPackage('npm', {
              serverUuid,
              packageName: firstArg,
            });
            
            // For 'node' command, we need to find the actual JS file to run
            // First try the binary path, then look for common entry points
            const possiblePaths = [
              packageInfo.binaryPath,
              packageInfo.binaryPath.replace(/node_modules\/.bin\/.*$/, `node_modules/${firstArg}/index.js`),
              packageInfo.binaryPath.replace(/node_modules\/.bin\/.*$/, `node_modules/${firstArg}/lib/index.js`),
              packageInfo.binaryPath.replace(/node_modules\/.bin\/.*$/, `node_modules/${firstArg}/dist/index.js`),
            ];
            
            // Find the first existing path
            let jsPath = packageInfo.binaryPath;
            for (const path of possiblePaths) {
              try {
                await import('fs').then(fs => fs.promises.access(path));
                jsPath = path;
                break;
              } catch {
                // Continue to next path
              }
            }
            
            return { 
              command: 'node',
              args: [jsPath, ...args.slice(1)],
              env: this.getEnvironmentForType('npm', serverUuid)
            };
          } catch (error) {
            console.error(`[PackageManager] Failed to handle 'node ${firstArg}':`, error);
            // Fall back to original command
          }
        }
      }
    }
    
    const packageManagerType = PackageManager.detectPackageManager(command);
    
    if (!packageManagerType) {
      // No transformation needed
      return { command, args };
    }
    
    // Package managers that execute packages directly
    if (['npm', 'npx', 'pnpm', 'pnpx', 'uvx', 'docker'].includes(command.toLowerCase())) {
      if (args.length === 0) {
        throw new Error(`No package specified for ${command}`);
      }
      
      // Filter out common npx/npm flags that should not be treated as package names
      const skipFlags = [
        '-y', '--yes',           // Skip confirmation prompts
        '-q', '--quiet',         // Suppress output
        '-s', '--silent',        // Suppress output
        '--no-install',          // Skip auto-install
        '--prefer-online',       // Prefer online packages
        '--prefer-offline',      // Prefer cached packages
        '--ignore-existing',     // Ignore existing installations
        '-p', '--package',       // Package specifier (handled separately)
        '--registry',            // Custom registry (handled separately)
      ];
      
      let packageIndex = 0;
      
      // Find the first argument that isn't a flag
      while (packageIndex < args.length) {
        const currentArg = args[packageIndex];
        
        // Check if it's a flag
        if (skipFlags.includes(currentArg)) {
          packageIndex++;
          continue;
        }
        
        // Check if it's a flag with value (e.g., --registry=https://...)
        if (currentArg.startsWith('--') && currentArg.includes('=')) {
          packageIndex++;
          continue;
        }
        
        // Check if it's a flag that takes a value in the next argument
        if (currentArg === '-p' || currentArg === '--package' || currentArg === '--registry') {
          packageIndex += 2; // Skip both the flag and its value
          continue;
        }
        
        // If it starts with - or --, it's likely an unknown flag, skip it
        if (currentArg.startsWith('-')) {
          packageIndex++;
          continue;
        }
        
        // Found a non-flag argument, this should be the package name
        break;
      }
      
      if (packageIndex >= args.length) {
        throw new Error(`No package specified for ${command} (only flags found)`);
      }
      
      const packageName = args[packageIndex];
      const packageArgs = args.slice(packageIndex + 1);
      
      // Install package if needed
      const handler = this.getHandler(packageManagerType);
      if (!handler) {
        throw new Error(`No handler for ${packageManagerType}`);
      }
      
      // Check if already installed
      const existingBinary = await handler.getBinaryPath(serverUuid, packageName);
      if (existingBinary) {
        console.log(`[PackageManager] Using cached package: ${packageName}`);
        
        // For npx/npm exec and docker, keep using the original command even if package is cached
        if (command === 'npx' || (command === 'npm' && args[0] === 'exec') || command === 'docker') {
          const installDir = (handler as any).getServerInstallDir(serverUuid);
          return { 
            command: command, 
            args: args, // Use original args including flags
            env: {
              ...this.getEnvironmentForType(packageManagerType, serverUuid),
              npm_config_prefix: installDir,
            }
          };
        }
        
        // For normal binaries, use the binary path
        if (existingBinary !== 'npx-package') {
          return { 
            command: existingBinary, 
            args: packageArgs,
            env: this.getEnvironmentForType(packageManagerType, serverUuid)
          };
        }
        
        // If it's an npx-package marker, fall through to install logic
        // This shouldn't happen but handle it gracefully
      }
      
      // Install package
      console.log(`[PackageManager] Installing package: ${packageName}`);
      await this.installPackage(packageManagerType, {
        serverUuid,
        packageName,
      });
      
      // For npx/npm exec and docker, keep using the original command
      // The package is installed, but we run it through the original command
      if (command === 'npx' || (command === 'npm' && args[0] === 'exec') || command === 'docker') {
        const handler = this.getHandler(packageManagerType);
        const installDir = (handler as any).getServerInstallDir(serverUuid);
        
        return { 
          command: command, 
          args: args, // Use original args including flags
          env: {
            ...this.getEnvironmentForType(packageManagerType, serverUuid),
            // Ensure npx can find the installed package
            npm_config_prefix: installDir,
          }
        };
      }
      
      // For other commands (node, python, etc.), use the binary path
      const installedBinary = await handler.getBinaryPath(serverUuid, packageName);
      if (!installedBinary || installedBinary === 'npx-package') {
        // This shouldn't happen for non-npx commands
        throw new Error(`Binary not found for ${packageName} after installation`);
      }
      
      return { 
        command: installedBinary, 
        args: packageArgs,
        env: this.getEnvironmentForType(packageManagerType, serverUuid)
      };
    }
    
    // For direct pip/uv/docker commands, just ensure environment is set
    return { 
      command, 
      args,
      env: this.getEnvironmentForType(packageManagerType, serverUuid)
    };
  }
  
  /**
   * Get environment variables for package manager type
   */
  private getEnvironmentForType(
    type: PackageManagerType, 
    serverUuid: string
  ): Record<string, string> {
    const env: Record<string, string> = {};
    
    if (type === 'npm' || type === 'pnpm') {
      const handler = this.handlers.get('pnpm') as PnpmHandler;
      const installDir = handler['getServerInstallDir'](serverUuid);
      env.NODE_PATH = `${installDir}/node_modules`;
      env.PATH = `${installDir}/node_modules/.bin:${process.env.PATH}`;
    } else if (type === 'uv' || type === 'uvx' || type === 'pip') {
      const handler = this.handlers.get('uv') as UvHandler;
      const installDir = handler['getServerInstallDir'](serverUuid);
      const venvDir = `${installDir}/.venv`;
      env.VIRTUAL_ENV = venvDir;
      env.PATH = `${venvDir}/bin:${process.env.PATH}`;
      env.PYTHONPATH = `${venvDir}/lib/python3.*/site-packages`;
    } else if (type === 'docker') {
      const handler = this.handlers.get('docker') as DockerHandler;
      const installDir = handler['getServerInstallDir'](serverUuid);
      env.PATH = `${installDir}:${process.env.PATH}`;
      // Docker doesn't need special environment variables like Node.js or Python
    }
    
    return env;
  }
  
  /**
   * Pre-warm common packages for faster startup
   */
  async prewarmCommonPackages(): Promise<void> {
    if (!PackageManagerConfig.PREWARM_COMMON_PACKAGES) {
      console.log('[PackageManager] Package pre-warming disabled');
      return;
    }
    
    console.log('[PackageManager] Pre-warming common packages...');
    
    const commonNodePackages = [
      '@modelcontextprotocol/sdk',
      'express',
      'fastify',
      'axios',
      'node-fetch',
    ];
    
    const commonPythonPackages = [
      'mcp',
      'fastapi',
      'requests',
      'httpx',
      'pydantic',
    ];
    
    const commonDockerImages = [
      'alpine:latest',
      'ubuntu:latest',
      'node:alpine',
      'python:alpine',
      'busybox:latest',
    ];
    
    const pnpmHandler = this.handlers.get('pnpm') as PnpmHandler;
    const uvHandler = this.handlers.get('uv') as UvHandler;
    const dockerHandler = this.handlers.get('docker') as DockerHandler;
    
    try {
      if (pnpmHandler.prewarmPackages) {
        await pnpmHandler.prewarmPackages(commonNodePackages);
      }
      
      if (uvHandler.prewarmPackages) {
        await uvHandler.prewarmPackages(commonPythonPackages);
      }
      
      if (dockerHandler.prewarmPackages) {
        await dockerHandler.prewarmPackages(commonDockerImages);
      }
      
      console.log('[PackageManager] Pre-warming completed');
    } catch (error) {
      console.error('[PackageManager] Pre-warming failed:', error);
    }
  }
  
  /**
   * Clean up packages for a server
   */
  async cleanupServer(serverUuid: string): Promise<void> {
    console.log(`[PackageManager] Cleaning up packages for server ${serverUuid}`);
    
    const cleanupPromises = Array.from(this.handlers.values()).map(handler =>
      handler.cleanup(serverUuid).catch(err => 
        console.warn(`Cleanup failed for ${handler.constructor.name}:`, err)
      )
    );
    
    await Promise.all(cleanupPromises);
  }
  
  /**
   * Get total disk usage for a server
   */
  async getServerDiskUsage(serverUuid: string): Promise<number> {
    const usagePromises = Array.from(this.handlers.values()).map(handler =>
      handler.getDiskUsage(serverUuid).catch(() => 0)
    );
    
    const usages = await Promise.all(usagePromises);
    return usages.reduce((total, usage) => total + usage, 0);
  }
}

// Export singleton instance
export const packageManager = new PackageManager();