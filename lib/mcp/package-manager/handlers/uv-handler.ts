import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { promises as fs } from 'fs';
import { BasePackageHandler, InstallOptions, PackageInfo } from './base-handler';
import { PackageManagerConfig } from '../config';

const execAsync = promisify(exec);

export class UvHandler extends BasePackageHandler {
  protected packageManagerName = 'uv';
  
  async install(options: InstallOptions): Promise<PackageInfo> {
    const { serverUuid, packageName, version } = options;
    const installDir = this.getServerInstallDir(serverUuid);
    const venvDir = path.join(installDir, '.venv');
    
    this.log('Installing Python package', { serverUuid, packageName, version, installDir });
    
    // Ensure directory exists
    await this.ensureDirectory(installDir);
    
    try {
      // Create virtual environment if it doesn't exist
      if (!(await this.fileExists(venvDir))) {
        await execAsync('uv venv', {
          cwd: installDir,
          env: {
            ...process.env,
            UV_CACHE_DIR: PackageManagerConfig.UV_CACHE_DIR,
            UV_PROJECT_ENVIRONMENT: venvDir,
          },
          timeout: PackageManagerConfig.STARTUP_TIMEOUT_MS,
        });
        
        this.log('Created virtual environment', { venvDir });
      }
      
      // Construct package spec
      const packageSpec = version ? `${packageName}==${version}` : packageName;
      
      // Install package using uv
      const { stdout, stderr } = await execAsync(
        `uv pip install ${packageSpec}`,
        {
          cwd: installDir,
          env: {
            ...process.env,
            UV_CACHE_DIR: PackageManagerConfig.UV_CACHE_DIR,
            UV_PROJECT_ENVIRONMENT: venvDir,
            VIRTUAL_ENV: venvDir,
          },
          timeout: PackageManagerConfig.STARTUP_TIMEOUT_MS,
        }
      );
      
      if (stderr && !stderr.includes('WARNING')) {
        console.warn(`[uv] Installation warnings for ${packageName}:`, stderr);
      }
      
      // Find the installed binary
      const binDir = path.join(venvDir, 'bin');
      let binaryPath = path.join(binDir, packageName);
      
      // Some Python packages install with different binary names
      if (!(await this.fileExists(binaryPath))) {
        // Try common variations
        const variations = [
          packageName.replace(/-/g, '_'),
          packageName.replace(/_/g, '-'),
          packageName.toLowerCase(),
          packageName.toUpperCase(),
        ];
        
        for (const variant of variations) {
          const variantPath = path.join(binDir, variant);
          if (await this.fileExists(variantPath)) {
            binaryPath = variantPath;
            break;
          }
        }
        
        // If still not found, look for any executable in bin
        if (!(await this.fileExists(binaryPath))) {
          const files = await fs.readdir(binDir);
          const executables = [];
          
          for (const file of files) {
            const filePath = path.join(binDir, file);
            const stats = await fs.stat(filePath);
            if (stats.isFile() && (stats.mode & 0o111)) { // Check if executable
              executables.push(file);
            }
          }
          
          if (executables.length === 1) {
            binaryPath = path.join(binDir, executables[0]);
          } else if (executables.length > 1) {
            // Try to find the most likely match
            const match = executables.find(exe => 
              exe.toLowerCase().includes(packageName.toLowerCase()) ||
              packageName.toLowerCase().includes(exe.toLowerCase())
            );
            if (match) {
              binaryPath = path.join(binDir, match);
            } else {
              throw new Error(
                `Multiple executables found for ${packageName}: ${executables.join(', ')}`
              );
            }
          } else {
            throw new Error(`No executable found for ${packageName}`);
          }
        }
      }
      
      // Get installed version
      let installedVersion = version;
      try {
        const { stdout: versionOutput } = await execAsync(
          `uv pip show ${packageName} | grep Version`,
          {
            cwd: installDir,
            env: {
              ...process.env,
              UV_PROJECT_ENVIRONMENT: venvDir,
              VIRTUAL_ENV: venvDir,
            },
          }
        );
        const versionMatch = versionOutput.match(/Version:\s*(.+)/);
        if (versionMatch) {
          installedVersion = versionMatch[1].trim();
        }
      } catch (error) {
        // Ignore version detection errors
      }
      
      this.log('Python package installed successfully', { 
        packageName, 
        version: installedVersion, 
        binaryPath 
      });
      
      return {
        name: packageName,
        version: installedVersion,
        binaryPath,
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
    const installDir = this.getServerInstallDir(serverUuid);
    const venvDir = path.join(installDir, '.venv');
    
    if (!(await this.fileExists(venvDir))) {
      return false;
    }
    
    try {
      const { stdout } = await execAsync(
        `uv pip show ${packageName}`,
        {
          cwd: installDir,
          env: {
            ...process.env,
            UV_PROJECT_ENVIRONMENT: venvDir,
            VIRTUAL_ENV: venvDir,
          },
        }
      );
      return stdout.includes('Name:');
    } catch {
      return false;
    }
  }
  
  async getBinaryPath(serverUuid: string, packageName: string): Promise<string | null> {
    const installDir = this.getServerInstallDir(serverUuid);
    const venvDir = path.join(installDir, '.venv');
    const binDir = path.join(venvDir, 'bin');
    
    if (!(await this.fileExists(binDir))) {
      return null;
    }
    
    // Check common binary paths
    const possiblePaths = [
      path.join(binDir, packageName),
      path.join(binDir, packageName.replace(/-/g, '_')),
      path.join(binDir, packageName.replace(/_/g, '-')),
      path.join(binDir, packageName.toLowerCase()),
    ];
    
    for (const binaryPath of possiblePaths) {
      if (await this.fileExists(binaryPath)) {
        return binaryPath;
      }
    }
    
    return null;
  }
  
  async cleanup(serverUuid: string): Promise<void> {
    const installDir = this.getServerInstallDir(serverUuid);
    
    try {
      await fs.rm(installDir, { recursive: true, force: true });
      this.log('Cleaned up Python packages', { serverUuid, installDir });
    } catch (error) {
      console.error(`Failed to cleanup Python packages for ${serverUuid}:`, error);
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
    
    const baseLayerDir = path.join(
      PackageManagerConfig.PACKAGE_STORE_DIR, 
      'overlays', 
      'base', 
      'python'
    );
    const venvDir = path.join(baseLayerDir, '.venv');
    
    await this.ensureDirectory(baseLayerDir);
    
    this.log('Pre-warming Python packages', { count: packages.length });
    
    // Create base virtual environment
    if (!(await this.fileExists(venvDir))) {
      await execAsync('uv venv', {
        cwd: baseLayerDir,
        env: {
          ...process.env,
          UV_CACHE_DIR: PackageManagerConfig.UV_CACHE_DIR,
          UV_PROJECT_ENVIRONMENT: venvDir,
        },
      });
    }
    
    // Install packages
    for (const packageName of packages) {
      try {
        await execAsync(`uv pip install ${packageName}`, {
          cwd: baseLayerDir,
          env: {
            ...process.env,
            UV_CACHE_DIR: PackageManagerConfig.UV_CACHE_DIR,
            UV_PROJECT_ENVIRONMENT: venvDir,
            VIRTUAL_ENV: venvDir,
          },
          timeout: 60000, // 1 minute for pre-warming
        });
        
        this.log('Pre-warmed Python package', { packageName });
      } catch (error) {
        console.warn(`Failed to pre-warm ${packageName}:`, error);
      }
    }
    
    this.log('Python pre-warming completed', { packages });
  }
}