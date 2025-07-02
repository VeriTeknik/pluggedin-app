import { promises as fs } from 'fs';
import path from 'path';

export interface PackageInfo {
  name: string;
  version?: string;
  binaryPath: string;
  installPath: string;
}

export interface InstallOptions {
  serverUuid: string;
  packageName: string;
  version?: string;
  env?: Record<string, string>;
}

export abstract class BasePackageHandler {
  protected abstract packageManagerName: string;
  
  /**
   * Install a package for a specific MCP server
   * @returns The binary path to execute
   */
  abstract install(options: InstallOptions): Promise<PackageInfo>;
  
  /**
   * Check if a package is already installed
   */
  abstract isInstalled(serverUuid: string, packageName: string): Promise<boolean>;
  
  /**
   * Get the binary path for an installed package
   */
  abstract getBinaryPath(serverUuid: string, packageName: string): Promise<string | null>;
  
  /**
   * Clean up installed packages for a server
   */
  abstract cleanup(serverUuid: string): Promise<void>;
  
  /**
   * Get disk usage for a server's packages
   */
  abstract getDiskUsage(serverUuid: string): Promise<number>;
  
  /**
   * Pre-warm common packages in the base layer
   */
  abstract prewarmPackages?(packages: string[]): Promise<void>;
  
  /**
   * Ensure directory exists
   */
  protected async ensureDirectory(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }
  
  /**
   * Get the install directory for a server
   */
  protected getServerInstallDir(serverUuid: string): string {
    const { PACKAGE_STORE_DIR } = require('../config').PackageManagerConfig;
    return path.join(PACKAGE_STORE_DIR, 'servers', serverUuid, this.packageManagerName);
  }
  
  /**
   * Check if a file exists
   */
  protected async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Get directory size recursively
   */
  protected async getDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;
    
    try {
      const files = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const file of files) {
        const fullPath = path.join(dirPath, file.name);
        
        if (file.isDirectory()) {
          totalSize += await this.getDirectorySize(fullPath);
        } else {
          const stats = await fs.stat(fullPath);
          totalSize += stats.size;
        }
      }
    } catch (error) {
      // Directory might not exist
      console.warn(`Failed to get size of ${dirPath}:`, error);
    }
    
    return totalSize;
  }
  
  /**
   * Log package operation
   */
  protected log(operation: string, details: Record<string, any>): void {
    console.log(`[${this.packageManagerName}] ${operation}:`, details);
  }
}