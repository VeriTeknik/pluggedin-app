import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';

import { buildSecurePath, validatePathComponent } from '@/lib/secure-path-builder';

import { PackageManagerConfig } from '../config';

const serverUuidSchema = z.string().uuid('Invalid server UUID provided to package handler.');

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
   * Start a host-side install from an empty directory.
   *
   * The server's directory is bind-mounted read-write into its own sandbox, so
   * anything already in here was left by code the user chose to run: an
   * interpreter in .venv/bin, an .npmrc pointing the registry inward, a
   * .pnpmfile.cjs, a symlink out of the store. The installer runs on the host,
   * outside that sandbox, and must read none of it. install() is only reached
   * when the package is missing, so there is nothing here worth keeping.
   *
   * fs.rm does not follow a symlink - it removes the link itself.
   */
  protected async resetDirectory(dirPath: string): Promise<void> {
    await fs.rm(dirPath, { recursive: true, force: true });
    await fs.mkdir(dirPath, { recursive: true });
  }

  /**
   * Get the install directory for a server
   */
  protected getServerInstallDir(serverUuid: string): string {
    const sanitizedServerUuid = serverUuidSchema.parse(serverUuid);
    validatePathComponent(this.packageManagerName);
    return buildSecurePath(PackageManagerConfig.PACKAGE_STORE_DIR, 'servers', sanitizedServerUuid, this.packageManagerName);
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
        // Symlinks are neither followed nor counted: one leading out (a venv's
        // bin/python) is refused by the path builder, one staying inside would
        // count its target twice.
        if (file.isSymbolicLink()) continue;

        // Validate file name to prevent path traversal
        validatePathComponent(file.name);
        const fullPath = buildSecurePath(dirPath, file.name);

        if (file.isDirectory()) {
          totalSize += await this.getDirectorySize(fullPath);
        } else {
          const stats = await fs.lstat(fullPath);
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
  }
}
