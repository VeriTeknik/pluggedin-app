import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { promises as fs } from 'fs';
import { BasePackageHandler, InstallOptions, PackageInfo } from './base-handler';
import { PackageManagerConfig } from '../config';

const execAsync = promisify(exec);

export class PnpmHandler extends BasePackageHandler {
  protected packageManagerName = 'pnpm';
  
  async install(options: InstallOptions): Promise<PackageInfo> {
    const { serverUuid, packageName, version } = options;
    const installDir = this.getServerInstallDir(serverUuid);
    
    this.log('Installing package', { serverUuid, packageName, version, installDir });
    
    // Ensure directory exists
    await this.ensureDirectory(installDir);
    
    // Create minimal package.json if not exists
    const packageJsonPath = path.join(installDir, 'package.json');
    if (!(await this.fileExists(packageJsonPath))) {
      await fs.writeFile(
        packageJsonPath,
        JSON.stringify({
          name: `mcp-server-${serverUuid}`,
          private: true,
          description: `Isolated packages for MCP server ${serverUuid}`,
        }, null, 2)
      );
    }
    
    // Construct package spec
    const packageSpec = version ? `${packageName}@${version}` : packageName;
    
    try {
      // Install package using pnpm
      const { stdout, stderr } = await execAsync(`pnpm add ${packageSpec}`, {
        cwd: installDir,
        env: {
          ...process.env,
          PNPM_STORE_DIR: PackageManagerConfig.PNPM_STORE_DIR,
          NODE_LINKER: 'isolated',
          PACKAGE_IMPORT_METHOD: 'clone', // For CoW filesystems
          PNPM_LOCKFILE: 'false', // Don't create lockfiles for isolated installs
        },
        timeout: PackageManagerConfig.STARTUP_TIMEOUT_MS,
      });
      
      if (stderr && !stderr.includes('WARN')) {
        console.warn(`[pnpm] Installation warnings for ${packageName}:`, stderr);
      }
      
      // Get the binary path
      const binaryPath = path.join(installDir, 'node_modules', '.bin', packageName);
      let foundBinaryPath: string | null = null;
      
      // Verify the binary exists
      if (await this.fileExists(binaryPath)) {
        foundBinaryPath = binaryPath;
      } else {
        // Try to find the actual binary name from package.json
        const packageJsonPath = path.join(installDir, 'node_modules', packageName, 'package.json');
        if (await this.fileExists(packageJsonPath)) {
          const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
          if (packageJson.bin) {
            const binName = typeof packageJson.bin === 'string' 
              ? packageName 
              : Object.keys(packageJson.bin)[0];
            const altBinaryPath = path.join(installDir, 'node_modules', '.bin', binName);
            if (await this.fileExists(altBinaryPath)) {
              foundBinaryPath = altBinaryPath;
            }
          }
        }
      }
      
      // Get installed version
      const installedPackageJson = path.join(installDir, 'node_modules', packageName, 'package.json');
      let installedVersion = version;
      if (await this.fileExists(installedPackageJson)) {
        const packageData = JSON.parse(await fs.readFile(installedPackageJson, 'utf-8'));
        installedVersion = packageData.version;
      }
      
      // For packages without binaries (meant to be run with npx), 
      // we still return success but with a special marker
      const effectiveBinaryPath = foundBinaryPath || 'npx-package';
      
      this.log('Package installed successfully', { 
        packageName, 
        version: installedVersion, 
        binaryPath: effectiveBinaryPath,
        hasBinary: !!foundBinaryPath
      });
      
      return {
        name: packageName,
        version: installedVersion,
        binaryPath: effectiveBinaryPath,
        installPath: installDir,
      };
    } catch (error) {
      this.log('Installation failed', { packageName, error });
      throw new Error(
        `Failed to install ${packageName}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
  
  async isInstalled(serverUuid: string, packageName: string): Promise<boolean> {
    const binaryPath = await this.getBinaryPath(serverUuid, packageName);
    return binaryPath !== null;
  }
  
  async getBinaryPath(serverUuid: string, packageName: string): Promise<string | null> {
    const installDir = this.getServerInstallDir(serverUuid);
    
    // First check if the package is installed at all
    const packageJsonPath = path.join(installDir, 'node_modules', packageName, 'package.json');
    if (!(await this.fileExists(packageJsonPath))) {
      return null; // Package not installed
    }
    
    // Check for binary in .bin directory
    const binaryPath = path.join(installDir, 'node_modules', '.bin', packageName);
    if (await this.fileExists(binaryPath)) {
      return binaryPath;
    }
    
    // Try to find alternative binary names
    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      if (packageJson.bin) {
        const binName = typeof packageJson.bin === 'string' 
          ? packageName 
          : Object.keys(packageJson.bin)[0];
        const altBinaryPath = path.join(installDir, 'node_modules', '.bin', binName);
        if (await this.fileExists(altBinaryPath)) {
          return altBinaryPath;
        }
      }
    } catch (error) {
      console.warn(`Failed to read package.json for ${packageName}:`, error);
    }
    
    // Package is installed but has no binary (npx-only package)
    // Return a special marker to indicate the package exists
    return 'npx-package';
  }
  
  async cleanup(serverUuid: string): Promise<void> {
    const installDir = this.getServerInstallDir(serverUuid);
    
    try {
      await fs.rm(installDir, { recursive: true, force: true });
      this.log('Cleaned up packages', { serverUuid, installDir });
    } catch (error) {
      console.error(`Failed to cleanup packages for ${serverUuid}:`, error);
      throw error;
    }
  }
  
  async getDiskUsage(serverUuid: string): Promise<number> {
    const installDir = this.getServerInstallDir(serverUuid);
    return this.getDirectorySize(installDir);
  }
  
  async prewarmPackages(packages: string[]): Promise<void> {
    if (!PackageManagerConfig.PREWARM_COMMON_PACKAGES) {
      return;
    }
    
    const baseLayerDir = path.join(PackageManagerConfig.PACKAGE_STORE_DIR, 'overlays', 'base', 'node_modules');
    await this.ensureDirectory(baseLayerDir);
    
    // Create a temporary package.json for base layer
    const tempDir = path.join(PackageManagerConfig.PACKAGE_STORE_DIR, 'temp-prewarm');
    await this.ensureDirectory(tempDir);
    
    const packageJsonPath = path.join(tempDir, 'package.json');
    await fs.writeFile(
      packageJsonPath,
      JSON.stringify({
        name: 'mcp-base-layer',
        private: true,
        description: 'Common packages for MCP servers',
      }, null, 2)
    );
    
    this.log('Pre-warming packages', { count: packages.length });
    
    for (const packageName of packages) {
      try {
        await execAsync(`pnpm add ${packageName}`, {
          cwd: tempDir,
          env: {
            ...process.env,
            PNPM_STORE_DIR: PackageManagerConfig.PNPM_STORE_DIR,
            NODE_LINKER: 'isolated',
          },
          timeout: 60000, // 1 minute for pre-warming
        });
        
        this.log('Pre-warmed package', { packageName });
      } catch (error) {
        console.warn(`Failed to pre-warm ${packageName}:`, error);
      }
    }
    
    // Move node_modules to base layer
    try {
      await fs.rename(
        path.join(tempDir, 'node_modules'),
        baseLayerDir
      );
    } catch (error) {
      // If rename fails, try copy
      await execAsync(`cp -r ${path.join(tempDir, 'node_modules')}/* ${baseLayerDir}/`);
    }
    
    // Cleanup temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
    
    this.log('Pre-warming completed', { packages });
  }
}